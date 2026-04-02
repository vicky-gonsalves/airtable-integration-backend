# Airtable Sync & Scraper API

This project is a robust [NestJS](https://github.com/nestjs/nest) backend application designed to integrate with Airtable. It provides OAuth2 authentication, synchronizes Airtable records (tickets) and users to a local MongoDB database, and utilizes a headless browser scraper (Puppeteer + Cheerio) to extract detailed revision history that isn't readily available through standard APIs.

## Ticket snapshot from database:
<img width="1582" height="990" alt="image" src="https://github.com/user-attachments/assets/4004b94c-3c1e-4bf7-8c97-3479b049bc76" />


## Revision snapshot from database:
<img width="1601" height="986" alt="image" src="https://github.com/user-attachments/assets/45af635a-7dcb-461f-ac38-f5ec1d2ede4b" />


## Key Features

- **Airtable OAuth2 Integration:** Securely authenticate users and manage access tokens via PKCE authorization flow.
- **Data Synchronization:** Fetch and store Airtable bases, tables, records (tickets), and associated users into MongoDB.
- **Revision History Scraper:** Authenticates via a headless browser (Puppeteer) using MFA to bypass API limitations and scrape historical row activity and revisions.
- **REST API & Swagger:** Fully documented RESTful endpoints with interactive Swagger UI.
- **Data Persistence:** Built on top of Mongoose for efficient MongoDB schema management (`Ticket`, `Revision`, `SyncMeta`, `User`).

## Prerequisites

Before you begin, ensure you have met the following requirements:
* **Node.js** (v16+ recommended)
* **Yarn** or **NPM**
* **MongoDB**: A running local or remote MongoDB instance.
* **Airtable Developer Account**: You need an Airtable OAuth integration registered to obtain your Client ID and Secret.

## Environment Variables

Create a `.env` file in the root of the project and add the following configuration:

```env
# Application
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/your-db-name

# Airtable OAuth Configuration
AIRTABLE_CLIENT_ID=your_airtable_client_id
AIRTABLE_CLIENT_SECRET=your_airtable_client_secret
AIRTABLE_REDIRECT_URI=http://localhost:3000/airtable/auth/callback
```

## Project Setup
Install the project dependencies:

```bash
$ yarn install
```

## Compile and Run the Project

```bash
# development
$ yarn run start

# watch mode (recommended for dev)
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## API Documentation (Swagger)
Once the application is running, you can access the interactive Swagger documentation.

URL: http://localhost:3000/api/docs

From the Swagger UI, you can explore all available endpoints, required DTOs, and test the APIs directly.

Core Endpoints Overview:
- ```GET /airtable/auth/url - Get the Airtable OAuth login URL.```

- ```GET /airtable/auth/callback - Handle OAuth redirect and set auth cookies.```

- ```POST /airtable/sync - Sync tickets from a specific base and table.```

- ```POST /airtable/scrape/auth - Login scraper with Email, Password, and MFA.```

- ```POST /airtable/scrape/run - Trigger Puppeteer to scrape revision history.```

- ```GET /airtable/tickets - Retrieve paginated synced tickets.```

- ```GET /airtable/revisions - Retrieve paginated scraped revisions.```

- ```GET /airtable/users - Retrieve paginated synced users.```


## Architecture & Tech Stack
- Framework: NestJS

- Language: TypeScript

- Database: MongoDB & Mongoose

- Scraping: Puppeteer (Headless Chrome) & Cheerio (HTML Parsing)

- Validation: class-validator and class-transformer

- Documentation: @nestjs/swagger
