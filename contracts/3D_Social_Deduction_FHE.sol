pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ThreeDSocialDeductionGameFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error InvalidBatch();
    error BatchClosed();
    error CooldownActive();
    error InvalidState();
    error InvalidRequest();
    error StaleWrite();
    error InvalidInput();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused();
    event Unpaused();
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event EncryptedTaskSubmitted(address indexed player, uint256 indexed batchId, bytes32 indexed taskId, bytes32 encryptedTask);
    event EncryptedVoteSubmitted(address indexed player, uint256 indexed batchId, bytes32 encryptedVote);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalScore, bool matchFound);
    event TaskCompleted(address indexed player, uint256 indexed batchId, bytes32 indexed taskId, bytes32 encryptedCompletion);
    event VoteProcessed(address indexed player, uint256 indexed batchId, bytes32 encryptedVote);
    event BatchAggregationStarted(uint256 indexed batchId);
    event BatchAggregationEnded(uint256 indexed batchId);

    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public constant MIN_INTERVAL = 10 seconds;
    uint256 public currentModelVersion;
    uint256 public currentBatchId;
    uint256 public totalBatches;

    mapping(address => bool) public providers;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(uint256 => mapping(bytes32 => EncryptedTask)) public encryptedTasks;
    mapping(uint256 => mapping(address => EncryptedVote)) public encryptedVotes;
    mapping(uint256 => euint32) public batchScoreAccumulators;
    mapping(uint256 => ebool) public batchMatchFlags;

    struct EncryptedTask {
        euint32 encryptedTaskData;
        ebool encryptedCompletionStatus;
        uint256 version;
    }

    struct EncryptedVote {
        euint32 encryptedVoteData;
        uint256 version;
    }

    struct Batch {
        bool isActive;
        uint256 createdAt;
        uint256 closedAt;
        uint256 totalTasks;
        uint256 totalVotes;
        address creator;
    }

    struct DecryptionContext {
        uint256 modelVersion;
        bytes32 stateHash;
        bool processed;
        uint256 batchId;
        address requester;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        currentModelVersion = 1;
        cooldownSeconds = 30;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        require(newCooldown >= MIN_INTERVAL, "Cooldown too short");
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function startNewBatch() external onlyProvider whenNotPaused checkCooldown {
        lastActionAt[msg.sender] = block.timestamp;
        currentBatchId = totalBatches + 1;
        totalBatches++;
        batches[currentBatchId] = Batch({
            isActive: true,
            createdAt: block.timestamp,
            closedAt: 0,
            totalTasks: 0,
            totalVotes: 0,
            creator: msg.sender
        });
        emit BatchOpened(currentBatchId, msg.sender);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isActive) revert BatchClosed();
        batch.isActive = false;
        batch.closedAt = block.timestamp;
        emit BatchClosed(batchId, msg.sender);
    }

    function submitEncryptedTask(
        uint256 batchId,
        bytes32 taskId,
        euint32 encryptedTaskData,
        ebool encryptedCompletionStatus
    ) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isActive) revert BatchClosed();

        lastActionAt[msg.sender] = block.timestamp;
        encryptedTasks[batchId][taskId] = EncryptedTask({
            encryptedTaskData: encryptedTaskData,
            encryptedCompletionStatus: encryptedCompletionStatus,
            version: currentModelVersion
        });
        batch.totalTasks++;
        emit EncryptedTaskSubmitted(msg.sender, batchId, taskId, FHE.toBytes32(encryptedTaskData));
    }

    function submitEncryptedVote(
        uint256 batchId,
        euint32 encryptedVoteData
    ) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isActive) revert BatchClosed();

        lastActionAt[msg.sender] = block.timestamp;
        encryptedVotes[batchId][msg.sender] = EncryptedVote({
            encryptedVoteData: encryptedVoteData,
            version: currentModelVersion
        });
        batch.totalVotes++;
        emit EncryptedVoteSubmitted(msg.sender, batchId, FHE.toBytes32(encryptedVoteData));
    }

    function completeTask(
        uint256 batchId,
        bytes32 taskId
    ) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isActive) revert BatchClosed();

        lastActionAt[msg.sender] = block.timestamp;
        EncryptedTask storage task = encryptedTasks[batchId][taskId];
        if (task.version != currentModelVersion) revert StaleWrite();

        // Homomorphically update completion status
        ebool memory newStatus = FHE.asEbool(true);
        task.encryptedCompletionStatus = newStatus;
        task.version = currentModelVersion + 1;

        emit TaskCompleted(msg.sender, batchId, taskId, FHE.toBytes32(task.encryptedTaskData));
    }

    function processVote(
        uint256 batchId,
        address player
    ) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.isActive) revert BatchClosed();

        lastActionAt[msg.sender] = block.timestamp;
        EncryptedVote storage vote = encryptedVotes[batchId][player];
        if (vote.version != currentModelVersion) revert StaleWrite();

        // Homomorphically add vote to batch score
        euint32 memory voteValue = vote.encryptedVoteData;
        euint32 storage acc = batchScoreAccumulators[batchId];
        if (!FHE.isInitialized(acc)) {
            acc = FHE.asEuint32(0);
        }
        acc = FHE.add(acc, voteValue);
        batchScoreAccumulators[batchId] = acc;
        vote.version = currentModelVersion + 1;

        emit VoteProcessed(player, batchId, FHE.toBytes32(vote.encryptedVoteData));
    }

    function startBatchAggregation(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.isActive) revert BatchClosed();

        emit BatchAggregationStarted(batchId);
    }

    function endBatchAggregation(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.isActive) revert BatchClosed();

        // Homomorphically compute match flag (simplified example)
        euint32 storage acc = batchScoreAccumulators[batchId];
        ebool storage matchFlag = batchMatchFlags[batchId];
        if (!FHE.isInitialized(acc)) {
            acc = FHE.asEuint32(0);
        }
        if (!FHE.isInitialized(matchFlag)) {
            matchFlag = FHE.asEbool(false);
        }

        // Example: Set match flag if score > threshold (homomorphically)
        euint32 memory threshold = FHE.asEuint32(100);
        ebool memory isAbove = FHE.ge(acc, threshold);
        matchFlag = isAbove;
        batchMatchFlags[batchId] = matchFlag;

        emit BatchAggregationEnded(batchId);
    }

    function requestBatchDecryption(uint256 batchId) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batchId > totalBatches) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.isActive) revert BatchClosed();

        lastActionAt[msg.sender] = block.timestamp;

        // Build ciphertexts array in well-defined order
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(batchScoreAccumulators[batchId]);
        cts[1] = FHE.toBytes32(batchMatchFlags[batchId]);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.onBatchDecryptionComplete.selector);

        decryptionContexts[requestId] = DecryptionContext({
            modelVersion: currentModelVersion,
            stateHash: stateHash,
            processed: false,
            batchId: batchId,
            requester: msg.sender
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function onBatchDecryptionComplete(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];
        if (ctx.processed) revert InvalidRequest();

        // Rebuild cts from current storage in same order
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(batchScoreAccumulators[ctx.batchId]);
        cts[1] = FHE.toBytes32(batchMatchFlags[ctx.batchId]);

        bytes32 currHash = _hashCiphertexts(cts);
        if (currHash != ctx.stateHash) revert InvalidState();

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts in same order
        (uint32 totalScore, bool matchFound) = abi.decode(cleartexts, (uint32, bool));

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalScore, matchFound);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal pure returns (euint32 memory) {
        if (!FHE.isInitialized(x)) {
            return FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}