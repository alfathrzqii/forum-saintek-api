# Forum SAINTEK API - Project Documentation

## Project Overview
**Forum SAINTEK API** is a RESTful API built with Node.js and Express to power a forum platform specifically designed for the Science and Technology (SAINTEK) faculty. It features user authentication, role-based access control, subforums, threads, nested comments, and a voting system.

### Key Features
- **User Management:** Registration, login, and profile management with roles (USER, MODERATOR, ADMIN).
- **Forum Structure:** Subforums containing threads.
- **Interactions:** Threads support images, anonymous posting (Saintekfess style), and voting.
- **Engagement:** Nested (Reddit-style) comments with voting support.
- **Security:** JWT-based authentication, password hashing with bcrypt, and security headers with Helmet.

### Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Validation:** Zod
- **Authentication:** JSON Web Token (JWT)
- **Logging:** Pino & Pino-http
- **Testing:** Jest & Supertest

## Architecture
The project follows a **Layered Architecture** pattern:

1.  **Routes (`src/api/routes`):** Defines API endpoints and applies middleware (Auth, Role).
2.  **Controllers (`src/api/controllers`):** Handles HTTP requests, validates input using Zod, and delegates business logic to services.
3.  **Services (`src/services`):** Implements core business logic and orchestration. Throws custom exceptions for error states.
4.  **Repositories (`src/repositories`):** Abstracts database operations using Prisma.
5.  **Validators (`src/validators`):** Centralized Zod schemas for request body validation.
6.  **Exceptions (`src/exceptions`):** Custom error classes (e.g., `InvariantError`, `NotFoundError`) for consistent error handling.
7.  **Middlewares (`src/api/middlewares`):** Authentication, Role Authorization, and Global Error Handling.

## Building and Running

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL database

### Installation
```bash
npm install
```

### Database Setup
1. Create a `.env` file based on existing configuration (needs `DATABASE_URL`, `ACCESS_TOKEN_KEY`, `REFRESH_TOKEN_KEY`).
2. Run migrations:
   ```bash
   npx prisma migrate dev
   ```
3. Seed the database:
   ```bash
   npm run seed
   ```

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Development Conventions

- **Surgical Updates:** When modifying code, adhere strictly to the existing Layered Architecture. Do not bypass services or repositories.
- **Validation:** Every POST/PUT request must be validated using a Zod schema in the controller before reaching the service layer.
- **Error Handling:** 
    - Use custom exceptions from `src/exceptions`.
    - Do not use `try-catch` blocks in controllers for operational errors; let the `errorMiddleware` handle them via `next(error)`.
- **Database:** All database interactions must go through a repository in `src/repositories`.
- **Naming:** 
    - Use camelCase for variables and functions.
    - Files should be named descriptively (e.g., `userController.js`, `userService.js`).
- **Testing:** 
    - Integration tests are preferred and should be placed in `tests/integration`.
    - Use `supertest` for API testing.
    - Ensure Prisma connection is handled correctly in `beforeAll`/`afterAll` to avoid hanging processes.
- **Security:** 
    - Always use `authenticationMiddleware` for routes requiring a logged-in user.
    - Use `roleMiddleware(['ADMIN', 'MODERATOR'])` for restricted actions.
    - Never return sensitive data like passwords in API responses (use Prisma `select` to filter fields).
