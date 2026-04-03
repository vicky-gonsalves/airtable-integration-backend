# Airtable Sync & Scraper API (Backend)

![Node.js](https://img.shields.io/badge/Node.js-v22-339933?logo=node.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?logo=mongodb&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-40B5A4?logo=puppeteer&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger-85EA2D?logo=swagger&logoColor=black)

This project is a robust [NestJS](https://github.com/nestjs/nest) backend application designed to provide deep integration with Airtable. It handles OAuth2 authentication, synchronizes Airtable records (using pagination) to a local MongoDB database, and utilizes a headless browser scraper to extract detailed revision history that isn't available through standard APIs.

## Ticket snapshot from database:
<img width="1582" height="990" alt="image" src="https://github.com/user-attachments/assets/4004b94c-3c1e-4bf7-8c97-3479b049bc76" />


## Revision snapshot from database:
<img width="1601" height="986" alt="image" src="https://github.com/user-attachments/assets/45af635a-7dcb-461f-ac38-f5ec1d2ede4b" />


---

## Key Features

This backend was built to satisfy complex integration and scraping requirements:

### 1. Standard API Integration (Part A)
- **Airtable OAuth2 Integration:** Securely authenticates users and manages access tokens via the PKCE authorization flow.
- **Automated Data Synchronization:** Fetches Airtable metadata (Bases, Tables) and records (Tickets, Users).
- **Pagination Support:** Adheres strictly to Airtable API pagination to ensure complete data extraction into distinct MongoDB collections.

### 2. Custom Revision Scraper (Part B)
- **Headless Authentication & MFA:** Utilizes Puppeteer to log into Airtable. Exposes endpoints to accept MFA codes passed from the frontend to seamlessly generate session cookies.
- **Session Management:** Automatically retrieves, validates, and re-uses cookies for the hidden `/readRowActivitiesAndComments` endpoint. If cookies expire, it prompts a re-auth.
- **HTML Parsing & Structuring:** Uses Cheerio to parse raw HTML responses into structured JSON logs, specifically isolating and tracking **Assignee** and **Status** changes.

### 3. API Design & Persistence
- **REST API & Swagger:** Fully documented RESTful endpoints with an interactive Swagger UI for easy testing.
- **Data Persistence:** Built on Mongoose for efficient MongoDB schema management (`Ticket`, `Revision`, `SyncMeta`, `User`).

---

## Architecture & Tech Stack

- **Framework:** NestJS (TypeScript)
- **Runtime:** Node.js v22
- **Database:** MongoDB & Mongoose
- **Scraping Engine:** Puppeteer (Headless Chrome) & Cheerio (HTML Parsing)
- **Validation:** `class-validator` and `class-transformer`
- **Documentation:** `@nestjs/swagger`

---

## Getting Started

### Prerequisites
Before you begin, ensure you have met the following requirements:
*   **Node.js v22**
*   **Yarn** or **NPM**
*   **MongoDB**: A running local (`localhost:27017`) or remote MongoDB instance.
*   **Airtable Developer Account**: You need an Airtable OAuth integration registered to obtain your Client ID and Secret.

### Environment Configuration

Create a `.env` file in the root of the project and add the following configuration:

```env
# Application
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/airtable-integration

# Airtable OAuth Configuration
AIRTABLE_CLIENT_ID=your_airtable_client_id
AIRTABLE_CLIENT_SECRET=your_airtable_client_secret
AIRTABLE_REDIRECT_URI=http://localhost:3000/airtable/auth/callback
```

### Installation

Install the project dependencies:
```bash
$ yarn install
```

### Compile and Run

```bash
# development
$ yarn run start

# watch mode (recommended for dev)
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

---

## API Documentation (Swagger)

Once the application is running, you can access the interactive Swagger documentation to explore available endpoints, required DTOs, and test the APIs directly.

**URL:** `http://localhost:3000/api/docs`

### Core Endpoints Overview

**Authentication & Synchronization**
*   `GET /airtable/auth/url` - Generate the Airtable OAuth login URL.
*   `GET /airtable/auth/callback` - Handle OAuth redirect and set authentication cookies.
*   `POST /airtable/sync` - Trigger a sync for tickets from a specific base and table.

**Custom Scraping Engine**
*   `POST /airtable/scrape/auth` - Authenticate the headless browser (Accepts Email, Password, and MFA).
*   `POST /airtable/scrape/run` - Trigger Puppeteer to fetch and parse the revision history using validated session cookies.

**Data Retrieval (For Frontend/Grid Consumption)**
*   `GET /airtable/tickets` - Retrieve paginated synced tickets.
*   `GET /airtable/revisions` - Retrieve paginated scraped revisions (Filtered by Status/Assignee).
*   `GET /airtable/users` - Retrieve paginated synced users.
