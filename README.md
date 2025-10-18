# 3D Social Deduction FHE: An Encrypted Gaming Experience

Dive into an immersive **3D Social Deduction Game**, where your mission is not just to complete tasks, but to uncover hidden identities—all powered by **Zama's Fully Homomorphic Encryption (FHE) technology**. In this thrilling environment, players must utilize their wits and spatial awareness to identify traitors while securely executing encrypted tasks. This project brings a fresh twist to the genre, ensuring that your gaming experience remains confidential and secure.

## The Challenge We Face

In an era where privacy and data security are paramount, online social deduction games often compromise player information and identities for gameplay mechanics. Traditional games expose player roles and task details, making it easy for traitors to exploit this information. This project addresses the critical pain point of privacy in gaming, ensuring that players can engage in their social strategic maneuvers without the threat of exposure or manipulation.

## How FHE Changes the Game

By leveraging **Zama's open-source FHE libraries**, this game enables players to perform computations on encrypted data. The integration of FHE allows for:

- **Encrypted Player Identities:** Player roles and task details are securely encrypted, ensuring that even while engaged in gameplay, no sensitive information is revealed.
- **Homomorphic Task Updates:** Players can update their task status without revealing their actions, making strategic decision-making both secure and engaging.
- **Social Reasoning Combined with Spatial Awareness:** Players must use their observations within the 3D environment to deduce who the traitors are, all while their identities and task statuses remain protected.

This implementation utilizes Zama's **Concrete** and **TFHE-rs** libraries, making the game not only a fun experience but also a secure platform for social interaction.

## Core Features

- 🔒 **Encrypted Player Identities:** Every player’s character and task remain hidden from others until necessary.
- 🕹️ **Objective-Based Gameplay:** Similar to "Among Us", players must complete tasks while identifying imposters.
- 🚀 **Immersive 3D Environment:** Explore a vibrant, cartoonish space-themed setting from either a first or third-person perspective.
- 🤖 **Dynamic Task Management:** Tasks are FHE encrypted and can only be revealed upon completion, keeping players engaged and strategizing.
- 🎭 **Real-time Social Interaction:** Players can communicate and strategize live while maintaining anonymity regarding their roles.

## Technology Stack

The game employs a variety of technologies to create a seamless experience, notably:

- **Zama's FHE Libraries:** Concrete and TFHE-rs for maintaining confidentiality.
- **Unity:** For building the 3D environment and gameplay mechanics.
- **Node.js:** For backend processing and real-time communication.
- **Hardhat:** For Ethereum smart contract management and deployment.

## Directory Structure

Here’s how the project is organized:

```
3D_Social_Deduction_FHE/
├── contracts/
│   ├── 3D_Social_Deduction_FHE.sol
├── src/
│   ├── client/
│   ├── server/
├── public/
│   ├── index.html
├── package.json
└── README.md
```

## Installation Guide

To set up the project on your local machine, follow these steps:

1. Ensure you have **Node.js** (v16 or later) installed on your system.
2. Ensure that you have **Hardhat** or **Foundry** installed. Check their official documentation for installation instructions.
3. Download or extract the project files into a directory of your choice.
4. Open your terminal and navigate to the project directory.
5. Run the following command to install dependencies, including the Zama FHE libraries:

   ```bash
   npm install
   ```

**Note:** Do not use `git clone` or any URLs; manually download the project files to avoid issues.

## Build & Run Guide

Once the dependencies are installed, you can build and run the game by following these commands:

1. **Compile the Smart Contracts:**
   
   ```bash
   npx hardhat compile
   ```

2. **Run the Development Server:**

   ```bash
   npm run start
   ```

3. **Play the Game:**
   
   Open your web browser and navigate to `http://localhost:3000` to start playing!

## Acknowledgements

### Powered by Zama

A heartfelt thanks to the Zama team for their pioneering work in Fully Homomorphic Encryption and the development of open-source tools that empower confidential blockchain applications. Your efforts have made this project not just a game, but a secure environment for social interaction and strategic gaming.

---

Unleash your inner detective in a world where trust and betrayal intertwine, all while keeping your identity secure! Engage in a unique experience where every move counts, and every player’s anonymity is upheld—welcome to the future of social deduction gaming!
