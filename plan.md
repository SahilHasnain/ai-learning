# AI Learning App MVP Plan

## Product Goal

Help users understand any topic in simple language through a repeatable loop:

> **Ask -> Understand -> Quiz -> Remember**

Positioning: **Understand any topic in simple language.**

## MVP Scope

### 1. Ask

- User enters any topic or question.
- User optionally chooses a starting difficulty: beginner, intermediate, or advanced.
- The app creates a learning session for the question.

### 2. Understand

- Generate an explanation at three difficulty levels.
- Include practical examples and analogies where useful.
- Let the user switch levels without losing the session.
- Keep the explanation structured and scannable rather than presenting an unrestricted chat transcript.

### 3. Quiz

- Generate a short quiz from the explanation.
- Use a small, fixed number of questions for the MVP.
- Show immediate correctness feedback and a brief explanation for each answer.
- Allow the user to retry the quiz.

### 4. Remember

- Save the topic, explanation, quiz result, and timestamps to learning history.
- Let users reopen previous sessions.
- Show a simple history list ordered by most recent activity.

## Core Screens

1. **Home**: question input and recent learning sessions.
2. **Explanation**: topic, difficulty selector, explanation, examples, and quiz CTA.
3. **Quiz**: one question at a time, answer feedback, score, and retry/finish actions.
4. **History**: saved sessions with topic, date, and latest quiz score.
5. **Session detail**: reopen the explanation and quiz result for a saved topic.

## Essential Data

- `User`: identity and account metadata.
- `LearningSession`: user, question, topic, current difficulty, created/updated timestamps.
- `Explanation`: session, difficulty, content, examples.
- `Quiz`: session, questions, answers, score, completion timestamp.
- `QuizQuestion`: prompt, choices, correct answer, explanation.

## AI Backend

Use a **Cloudflare Worker** as the only client-facing AI backend. The frontend must never call Gemini or Groq directly.

### Provider Strategy

- Support two providers behind one internal interface: **Gemini** and **Groq**.
- Keep prompts and response schemas provider-independent.
- Select a primary provider for each request.
- If the primary provider hits a quota, rate limit, or provider availability error, fail over to the other provider at runtime.
- Return one normalized response format to the frontend regardless of provider.
- Do not retry the same failed provider repeatedly within one request.

### Worker Request Flow

1. Authenticate and validate the incoming request.
2. Select the preferred provider, using a lightweight in-memory/provider health signal where available.
3. Send the request through the provider adapter.
4. Normalize the successful provider response.
5. On a retryable quota, rate-limit, timeout, or availability error, try the other provider once.
6. Return a clear error only when both providers fail.
7. Log provider, latency, failure category, and fallback usage without logging API keys or private user content.

### Provider Adapters

Each adapter should define the same operations:

- Generate explanations for the three difficulty levels.
- Generate quiz questions from an explanation.
- Map provider-specific errors to shared categories such as `quota`, `rate_limit`, `timeout`, `unavailable`, and `invalid_request`.
- Validate the returned structured output before it reaches the application.

### Secrets and Configuration

- Store `GEMINI_API_KEY` and `GROQ_API_KEY` as Cloudflare Worker secrets.
- Keep provider model names and routing defaults in Worker configuration, not in frontend code.
- Never expose provider keys in client bundles, logs, or saved learning sessions.
- Add a per-user request limit so provider failover cannot be used to bypass the app's own usage limits.

### AI Backend Acceptance Criteria

- The frontend uses only the Worker endpoint.
- A quota or rate-limit response from Gemini automatically attempts Groq, and vice versa.
- A non-retryable request error is returned without wasting a second provider request.
- Responses from both providers produce the same explanation and quiz schema.
- If both providers are unavailable, the user sees an actionable temporary-failure message.
- Provider choice, fallback count, and failure category are observable without exposing secrets or user prompts.

## Product Rules

- The app must guide the user through the learning loop; it should not feel like a generic chatbot.
- AI output must be constrained to the requested topic and difficulty.
- Quiz questions must be answerable from the generated explanation.
- Preserve generated content for a session so reopening it does not require regeneration.
- Handle loading, generation failures, empty input, and rate limits clearly.
- Provide a way to report incorrect or low-quality explanations.

## Non-Goals

- No syllabus, course marketplace, or teacher/content management system.
- No broad social features, leaderboards, or collaboration.
- No unrestricted chat interface in the MVP.
- No spaced-repetition scheduling beyond storing history.
- No support for every AI provider or advanced personalization initially.

## Implementation Phases

### Phase 1: Foundation

- Confirm the frontend framework, database, authentication approach, and deployment targets.
- Create the app shell and route structure for Home, Explanation, Quiz, and History.
- Add shared types for `LearningSession`, `Explanation`, `Quiz`, and `QuizQuestion`.
- Set up environment configuration for local development and production.

**Checkpoint:** The app runs locally with navigation between placeholder screens.

### Phase 2: Cloudflare Worker API

- Create the Cloudflare Worker project and a health-check endpoint.
- Add request validation, authentication checks, CORS, and consistent error responses.
- Add `GEMINI_API_KEY` and `GROQ_API_KEY` as Worker secrets.
- Define the provider interface and normalized explanation/quiz response schemas.
- Add structured logging for request ID, provider, latency, and failure category.

**Checkpoint:** The frontend can call the Worker health endpoint, and secrets are not exposed to the client.

### Phase 3: Provider Adapters and Failover

- Implement the Gemini adapter for explanation and quiz generation.
- Implement the Groq adapter for the same operations.
- Normalize successful responses into the shared schemas.
- Map provider errors into retryable and non-retryable categories.
- Implement one-time fallback from the primary provider to the other provider.
- Prevent duplicate retries and ensure both-provider failure returns a safe error.
- Add per-user request limits at the Worker boundary.

**Checkpoint:** Automated tests prove that Gemini failure falls back to Groq and Groq failure falls back to Gemini.

### Phase 4: Ask and Understand Flow

- Build the question input on Home.
- Validate empty, oversized, and invalid questions.
- Add difficulty selection and loading states.
- Connect question submission to the Worker.
- Render the structured explanation, examples, and difficulty selector.
- Persist the generated session and explanation.

**Checkpoint:** A user can ask a question and read all three difficulty levels without using a chat interface.

### Phase 5: Quiz Flow

- Add the quiz-generation action from the explanation screen.
- Render one question at a time with answer choices.
- Add immediate answer feedback and answer explanations.
- Calculate and persist the score.
- Add retry and finish actions.
- Handle malformed quiz output and generation failures.

**Checkpoint:** A user can complete, review, and retry a quiz generated from the explanation.

### Phase 6: History and Reopening

- Store sessions, explanations, quizzes, and quiz results in persistent storage.
- Build the recent-sessions list on Home.
- Build the History screen with dates and latest scores.
- Add session detail and reopening behavior.
- Verify that refreshes and navigation do not lose saved content.

**Checkpoint:** A completed learning session can be reopened without regenerating AI content.

### Phase 7: Reliability and Product Safeguards

- Add clear UI states for loading, timeout, quota exhaustion, and both-provider failure.
- Add request cancellation or stale-response protection where needed.
- Add abuse protection and usage-limit messaging.
- Add a report-quality or feedback action for explanations and quizzes.
- Verify that logs never contain API keys or private prompts.

**Checkpoint:** Expected failures are understandable to users and observable to the developer.

### Phase 8: Testing and Release

- Unit test provider adapters, error mapping, schema validation, and failover.
- Integration test the Worker endpoints with mocked Gemini and Groq responses.
- Test the complete Ask -> Understand -> Quiz -> Remember path.
- Test mobile and desktop layouts.
- Test authentication, persistence, refresh, rate limits, and both-provider outage behavior.
- Deploy the Worker and frontend to staging.
- Run a small real-user pilot, fix the highest-friction issues, and release the MVP.

**Checkpoint:** The MVP acceptance criteria pass in staging on desktop and mobile.

## MVP Acceptance Criteria

- A new user can ask a question and receive explanations at all three levels.
- A user can read examples, take a quiz, receive a score, and retry it.
- The completed session appears in history and can be reopened with its saved content.
- Refreshing or leaving the page does not lose a saved session.
- Invalid input and AI/API failures produce actionable user feedback.
- The primary path from question to quiz is clear without requiring chat-style prompting.

## Success Signals

- Users complete the full Ask -> Understand -> Quiz loop.
- Users return to saved sessions.
- Quiz completion and retry rates show whether explanations lead to active recall.
- Feedback indicates that explanations are clear and appropriately difficult.
