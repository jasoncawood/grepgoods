# GrepGoods

GrepGoods is a decentralized marketplace index for the Fediverse. It aggregates marketplace listings across ActivityPub into a searchable directory without centralized control, tracking, or data harvesting.

## Why GrepGoods?
Centralized marketplaces often rely on invasive tracking and data harvesting. GrepGoods was built to provide a privacy-focused alternative where the community maintains control. It acts as a passive listener, allowing sellers to list items simply by mentioning the bot, keeping the commerce workflow within the Fediverse.

## Core Concept
The system functions as a CLI daemon for ActivityPub.

*   **List:** Mention `@market@grepgoods.space` in a listing.
*   **Enrich:** Local AI extracts details like Name, Price, and Currency.
*   **Verify:** The bot sends a signed Direct Message to the seller to confirm.
*   **Index:** Items appear on a searchable, infinite-scrolling dashboard.
*   **Sync:** The index automatically handles `#sold` replies and `Delete` activities.

## Privacy & Security
*   **Isolated System:** Foreign media is never hotlinked. Images are routed through a proxy that masks buyer IP addresses and strips metadata.
*   **Local AI:** Data extraction happens via a local Ollama instance; listing content never leaves the server.
*   **Digital Verification:** 
    *   Inbound: Signatures are verified against the sender's public key.
    *   Outbound: Interactions use RSA-SHA256 signatures for compatibility with "Secure Mode" instances.
*   **Hardened Frontend:** Strict MIME filtering and a robust Content Security Policy (CSP).

## Technical Stack
*   **Backend:** Node.js, TypeScript, Express.
*   **Processing:** BullMQ & Redis for asynchronous tasks.
*   **Database:** SQLite.
*   **AI:** Ollama.
*   **Proxy:** OpenResty (Nginx + Lua).
*   **Testing:** Jest & Supertest.

## Getting Started

### Prerequisites
*   Docker & Docker Compose
*   Ollama

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/jasoncawood/grepgoods.git
    cd grepgoods
    ```
2.  Configure environment:
    ```bash
    cp .env.example .env
    ```
3.  Launch:
    ```bash
    docker compose up -d --build
    ```

## Development & Testing

### Seeding Data
Generate 15 random listings:
```bash
docker exec grepgoods-app-1 npm run seed
```

### Running Tests
```bash
docker exec grepgoods-app-1 npm test
```

### Moderation
Manage blocks directly via CLI:
```bash
docker exec grepgoods-app-1 npm run moderate block domain example.com "Reason"
```

## License
GPL-3.0 License. See [LICENSE](LICENSE) for details.
