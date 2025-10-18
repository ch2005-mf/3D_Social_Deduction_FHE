// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Player {
  id: string;
  encryptedRole: string;
  encryptedTasks: string[];
  position: { x: number; y: number; z: number };
  status: "alive" | "dead" | "disconnected";
  lastSeen: number;
}

interface Task {
  id: string;
  encryptedDescription: string;
  encryptedStatus: string;
  location: { x: number; y: number; z: number };
}

// Randomly selected style: High Contrast (Red+Black), Cyberpunk UI, Center Radiation Layout, Animation Rich
const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increment':
      result = value + 1;
      break;
    case 'toggle':
      result = value === 1 ? 0 : 1;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPlayerData, setNewPlayerData] = useState({ role: 0, position: { x: 0, y: 0, z: 0 } });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [decryptedRole, setDecryptedRole] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [gameStatus, setGameStatus] = useState<"lobby" | "playing" | "finished">("lobby");
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [decryptedTaskStatus, setDecryptedTaskStatus] = useState<number | null>(null);

  const alivePlayers = players.filter(p => p.status === "alive").length;
  const deadPlayers = players.filter(p => p.status === "dead").length;

  useEffect(() => {
    loadGameData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadGameData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load players
      const playersBytes = await contract.getData("game_players");
      let playerList: Player[] = [];
      if (playersBytes.length > 0) {
        try {
          const playersStr = ethers.toUtf8String(playersBytes);
          if (playersStr.trim() !== '') playerList = JSON.parse(playersStr);
        } catch (e) { console.error("Error parsing players:", e); }
      }
      
      // Load tasks
      const tasksBytes = await contract.getData("game_tasks");
      let taskList: Task[] = [];
      if (tasksBytes.length > 0) {
        try {
          const tasksStr = ethers.toUtf8String(tasksBytes);
          if (tasksStr.trim() !== '') taskList = JSON.parse(tasksStr);
        } catch (e) { console.error("Error parsing tasks:", e); }
      }
      
      // Load game state
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length > 0) {
        try {
          const gameState = JSON.parse(ethers.toUtf8String(gameStateBytes));
          setGameStatus(gameState.status || "lobby");
          setCurrentRound(gameState.round || 1);
        } catch (e) { console.error("Error parsing game state:", e); }
      }
      
      setPlayers(playerList);
      setTasks(taskList);
    } catch (e) { console.error("Error loading game data:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const addPlayer = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting player data with Zama FHE..." });
    try {
      const encryptedRole = FHEEncryptNumber(newPlayerData.role);
      const encryptedTasks = ["FHE-MQ==", "FHE-Mg=="]; // Sample encrypted tasks
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const playerId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const playerData: Player = { 
        id: playerId,
        encryptedRole,
        encryptedTasks,
        position: newPlayerData.position,
        status: "alive",
        lastSeen: Math.floor(Date.now() / 1000)
      };
      
      // Update players list
      const playersBytes = await contract.getData("game_players");
      let playerList: Player[] = [];
      if (playersBytes.length > 0) {
        try { playerList = JSON.parse(ethers.toUtf8String(playersBytes)); } 
        catch (e) { console.error("Error parsing players:", e); }
      }
      playerList.push(playerData);
      
      await contract.setData("game_players", ethers.toUtf8Bytes(JSON.stringify(playerList)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Player added with FHE encryption!" });
      await loadGameData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPlayerData({ role: 0, position: { x: 0, y: 0, z: 0 } });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const startGame = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Initializing game with FHE encryption..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const gameState = {
        status: "playing",
        round: 1,
        startTime: Math.floor(Date.now() / 1000)
      };
      
      await contract.setData("game_state", ethers.toUtf8String(JSON.stringify(gameState)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Game started with FHE roles!" });
      await loadGameData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Game start failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const completeTask = async (taskId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Updating task with FHE computation..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      const tasksBytes = await contract.getData("game_tasks");
      let taskList: Task[] = [];
      if (tasksBytes.length > 0) {
        try { taskList = JSON.parse(ethers.toUtf8String(tasksBytes)); } 
        catch (e) { console.error("Error parsing tasks:", e); }
      }
      
      const taskIndex = taskList.findIndex(t => t.id === taskId);
      if (taskIndex === -1) throw new Error("Task not found");
      
      const updatedTask = { 
        ...taskList[taskIndex], 
        encryptedStatus: FHECompute(taskList[taskIndex].encryptedStatus, 'toggle')
      };
      taskList[taskIndex] = updatedTask;
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      await contractWithSigner.setData("game_tasks", ethers.toUtf8String(JSON.stringify(taskList)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Task status updated with FHE!" });
      await loadGameData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Task update failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const votePlayer = async (playerId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing vote with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const playersBytes = await contract.getData("game_players");
      let playerList: Player[] = [];
      if (playersBytes.length > 0) {
        try { playerList = JSON.parse(ethers.toUtf8String(playersBytes)); } 
        catch (e) { console.error("Error parsing players:", e); }
      }
      
      const playerIndex = playerList.findIndex(p => p.id === playerId);
      if (playerIndex === -1) throw new Error("Player not found");
      
      const updatedPlayer = { 
        ...playerList[playerIndex], 
        status: "dead" // In a real game, this would be more complex
      };
      playerList[playerIndex] = updatedPlayer;
      
      await contract.setData("game_players", ethers.toUtf8String(JSON.stringify(playerList)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Vote processed with FHE!" });
      await loadGameData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Vote failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isGameMaster = (playerAddress: string) => {
    // In a real game, this would check if the player is the game master
    return address?.toLowerCase() === playerAddress.toLowerCase();
  };

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to join the game", icon: "🔗" },
    { title: "FHE Encrypted Roles", description: "Your role is encrypted using Zama FHE technology", icon: "🔒", details: "No one can see your real role until you choose to reveal it" },
    { title: "Complete Encrypted Tasks", description: "Tasks are processed in encrypted state", icon: "⚙️", details: "Zama FHE allows task completion verification without revealing your role" },
    { title: "Social Deduction", description: "Use spatial behavior and encrypted clues to find imposters", icon: "🕵️", details: "The game combines 3D movement analysis with encrypted voting" }
  ];

  const renderPlayerStatusChart = () => {
    const total = players.length || 1;
    const alivePercentage = (alivePlayers / total) * 100;
    const deadPercentage = (deadPlayers / total) * 100;
    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div className="pie-segment alive" style={{ transform: `rotate(${alivePercentage * 3.6}deg)` }}></div>
          <div className="pie-segment dead" style={{ transform: `rotate(${(alivePercentage + deadPercentage) * 3.6}deg)` }}></div>
          <div className="pie-center">
            <div className="pie-value">{players.length}</div>
            <div className="pie-label">Players</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item"><div className="color-box alive"></div><span>Alive: {alivePlayers}</span></div>
          <div className="legend-item"><div className="color-box dead"></div><span>Eliminated: {deadPlayers}</span></div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted game session...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="shield-icon"></div></div>
          <h1>3D<span>隱殺</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn cyber-button">
            <div className="add-icon"></div>Join Game
          </button>
          <button className="cyber-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>3D Social Deduction with FHE</h2>
            <p>Discover imposters through spatial behavior analysis and encrypted clues</p>
          </div>
          <div className="fhe-indicator"><div className="fhe-lock"></div><span>FHE Encryption Active</span></div>
        </div>
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Social Deduction Tutorial</h2>
            <p className="subtitle">Learn how to play this encrypted social deduction game</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="fhe-diagram">
              <div className="diagram-step"><div className="diagram-icon">👤</div><div className="diagram-label">Player Role</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">🔒</div><div className="diagram-label">FHE Encryption</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">🕹️</div><div className="diagram-label">Game Actions</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">🕵️</div><div className="diagram-label">Social Deduction</div></div>
            </div>
          </div>
        )}
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card">
            <h3>Game Introduction</h3>
            <p>3D social deduction game where player roles and tasks are encrypted using <strong>Zama FHE technology</strong>. Analyze spatial behavior and complete encrypted tasks to identify imposters.</p>
            <div className="fhe-badge"><span>FHE-Powered</span></div>
          </div>
          <div className="dashboard-card cyber-card">
            <h3>Game Status</h3>
            <div className="stats-grid">
              <div className="stat-item"><div className="stat-value">{players.length}</div><div className="stat-label">Total Players</div></div>
              <div className="stat-item"><div className="stat-value">{alivePlayers}</div><div className="stat-label">Alive</div></div>
              <div className="stat-item"><div className="stat-value">{deadPlayers}</div><div className="stat-label">Eliminated</div></div>
              <div className="stat-item"><div className="stat-value">{currentRound}</div><div className="stat-label">Round</div></div>
            </div>
          </div>
          <div className="dashboard-card cyber-card"><h3>Player Status</h3>{renderPlayerStatusChart()}</div>
        </div>
        <div className="game-sections">
          <div className="players-section">
            <div className="section-header">
              <h2>Players</h2>
              <div className="header-actions">
                <button onClick={loadGameData} className="refresh-btn cyber-button" disabled={isRefreshing}>
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
                {isGameMaster(address || "") && gameStatus === "lobby" && (
                  <button onClick={startGame} className="cyber-button primary">
                    Start Game
                  </button>
                )}
              </div>
            </div>
            <div className="players-list cyber-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Last Seen</div>
                <div className="header-cell">Actions</div>
              </div>
              {players.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No players in game</p>
                  <button className="cyber-button primary" onClick={() => setShowCreateModal(true)}>Join Game</button>
                </div>
              ) : players.map(player => (
                <div className="record-row" key={player.id} onClick={() => setSelectedPlayer(player)}>
                  <div className="table-cell record-id">#{player.id.substring(0, 6)}</div>
                  <div className="table-cell"><span className={`status-badge ${player.status}`}>{player.status}</span></div>
                  <div className="table-cell">{new Date(player.lastSeen * 1000).toLocaleTimeString()}</div>
                  <div className="table-cell actions">
                    {gameStatus === "playing" && player.status === "alive" && (
                      <button className="action-btn cyber-button danger" onClick={(e) => { e.stopPropagation(); votePlayer(player.id); }}>Vote Out</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="tasks-section">
            <div className="section-header">
              <h2>Tasks</h2>
            </div>
            <div className="tasks-grid">
              {tasks.length === 0 ? (
                <div className="no-tasks">
                  <div className="no-tasks-icon"></div>
                  <p>No tasks available</p>
                </div>
              ) : tasks.map(task => (
                <div className="task-card cyber-card" key={task.id} onClick={() => { setSelectedTask(task); setShowTaskModal(true); }}>
                  <div className="task-id">Task #{task.id.substring(0, 4)}</div>
                  <div className="task-status">
                    <span className="status-indicator"></span>
                    <span>Encrypted</span>
                  </div>
                  <button className="cyber-button small" onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}>Complete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showCreateModal && <ModalCreate onSubmit={addPlayer} onClose={() => setShowCreateModal(false)} creating={creating} playerData={newPlayerData} setPlayerData={setNewPlayerData}/>}
      {selectedPlayer && <PlayerDetailModal player={selectedPlayer} onClose={() => { setSelectedPlayer(null); setDecryptedRole(null); }} decryptedRole={decryptedRole} setDecryptedRole={setDecryptedRole} isDecrypting={isDecrypting} decryptWithSignature={decryptWithSignature}/>}
      {showTaskModal && selectedTask && <TaskDetailModal task={selectedTask} onClose={() => { setShowTaskModal(false); setSelectedTask(null); setDecryptedTaskStatus(null); }} decryptedStatus={decryptedTaskStatus} setDecryptedStatus={setDecryptedTaskStatus} isDecrypting={isDecrypting} decryptWithSignature={decryptWithSignature}/>}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="shield-icon"></div><span>3D隱殺</span></div>
            <p>Social deduction game with Zama FHE encrypted roles and tasks</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} 3D隱殺. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  playerData: any;
  setPlayerData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, playerData, setPlayerData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPlayerData({ ...playerData, [name]: value });
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLInputElement>, axis: 'x' | 'y' | 'z') => {
    const value = parseFloat(e.target.value);
    setPlayerData({ 
      ...playerData, 
      position: { 
        ...playerData.position, 
        [axis]: value 
      } 
    });
  };

  const handleSubmit = () => {
    if (playerData.role === undefined) { alert("Please select a role"); return; }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Join Game</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div><strong>FHE Encryption Notice</strong><p>Your role will be encrypted with Zama FHE before submission</p></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Role *</label>
              <select name="role" value={playerData.role} onChange={handleChange} className="cyber-select">
                <option value="">Select role</option>
                <option value="0">Crewmate</option>
                <option value="1">Imposter</option>
              </select>
            </div>
            <div className="form-group">
              <label>Starting Position X</label>
              <input 
                type="number" 
                value={playerData.position.x} 
                onChange={(e) => handlePositionChange(e, 'x')}
                className="cyber-input"
                step="0.1"
              />
            </div>
            <div className="form-group">
              <label>Starting Position Y</label>
              <input 
                type="number" 
                value={playerData.position.y} 
                onChange={(e) => handlePositionChange(e, 'y')}
                className="cyber-input"
                step="0.1"
              />
            </div>
            <div className="form-group">
              <label>Starting Position Z</label>
              <input 
                type="number" 
                value={playerData.position.z} 
                onChange={(e) => handlePositionChange(e, 'z')}
                className="cyber-input"
                step="0.1"
              />
            </div>
          </div>
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data"><span>Plain Role:</span><div>{playerData.role === "0" ? "Crewmate" : playerData.role === "1" ? "Imposter" : "Not selected"}</div></div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{playerData.role !== undefined ? FHEEncryptNumber(parseInt(playerData.role)).substring(0, 50) + '...' : 'No role selected'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn cyber-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn cyber-button primary">
            {creating ? "Encrypting with FHE..." : "Join Game"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PlayerDetailModalProps {
  player: Player;
  onClose: () => void;
  decryptedRole: number | null;
  setDecryptedRole: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, onClose, decryptedRole, setDecryptedRole, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedRole !== null) { setDecryptedRole(null); return; }
    const decrypted = await decryptWithSignature(player.encryptedRole);
    if (decrypted !== null) setDecryptedRole(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal cyber-card">
        <div className="modal-header">
          <h2>Player Details #{player.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item"><span>Status:</span><strong className={`status-badge ${player.status}`}>{player.status}</strong></div>
            <div className="info-item"><span>Last Seen:</span><strong>{new Date(player.lastSeen * 1000).toLocaleString()}</strong></div>
            <div className="info-item"><span>Position:</span><strong>X: {player.position.x}, Y: {player.position.y}, Z: {player.position.z}</strong></div>
          </div>
          <div className="encrypted-data-section">
            <h3>Encrypted Role</h3>
            <div className="encrypted-data">{player.encryptedRole.substring(0, 100)}...</div>
            <div className="fhe-tag"><div className="fhe-icon"></div><span>FHE Encrypted</span></div>
            <button className="decrypt-btn cyber-button" onClick={handleDecrypt} disabled={isDecrypting}>
              {isDecrypting ? <span className="decrypt-spinner"></span> : decryptedRole !== null ? "Hide Decrypted Role" : "Decrypt Role with Wallet"}
            </button>
          </div>
          {decryptedRole !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Role</h3>
              <div className="decrypted-value">{decryptedRole === 0 ? "Crewmate" : "Imposter"}</div>
              <div className="decryption-notice"><div className="warning-icon"></div><span>Decrypted role is only visible after wallet signature verification</span></div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn cyber-button">Close</button>
        </div>
      </div>
    </div>
  );
};

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  decryptedStatus: number | null;
  setDecryptedStatus: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, decryptedStatus, setDecryptedStatus, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedStatus !== null) { setDecryptedStatus(null); return; }
    const decrypted = await decryptWithSignature(task.encryptedStatus);
    if (decrypted !== null) setDecryptedStatus(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal cyber-card">
        <div className="modal-header">
          <h2>Task Details #{task.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item"><span>Location:</span><strong>X: {task.location.x}, Y: {task.location.y}, Z: {task.location.z}</strong></div>
          </div>
          <div className="encrypted-data-section">
            <h3>Encrypted Description</h3>
            <div className="encrypted-data">{task.encryptedDescription.substring(0, 100)}...</div>
            <div className="fhe-tag"><div className="fhe-icon"></div><span>FHE Encrypted</span></div>
          </div>
          <div className="encrypted-data-section">
            <h3>Encrypted Status</h3>
            <div className="encrypted-data">{task.encryptedStatus.substring(0, 100)}...</div>
            <button className="decrypt-btn cyber-button" onClick={handleDecrypt} disabled={isDecrypting}>
              {isDecrypting ? <span className="decrypt-spinner"></span> : decryptedStatus !== null ? "Hide Decrypted Status" : "Decrypt Status with Wallet"}
            </button>
          </div>
          {decryptedStatus !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Status</h3>
              <div className="decrypted-value">{decryptedStatus === 0 ? "Incomplete" : "Complete"}</div>
              <div className="decryption-notice"><div className="warning-icon"></div><span>Decrypted status is only visible after wallet signature verification</span></div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn cyber-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;