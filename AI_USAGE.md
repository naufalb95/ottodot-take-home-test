# AI Usage

## Which AI tools did you use?

Anthropic Claude + Claude Code.

## What did you use AI for?

I brainstormed with the AI to create the ADR, architecture doc, ERD, and the approach for the last-seat race condition. Once all documentation was finalised, I let the AI scaffold the services based on those documents and verified the outcome.

## One place where AI helped you move faster

Scaffolding code and diagnosing errors. When something broke during Docker setup or Prisma migration, the AI could read the error output and propose a fix immediately — things like Prisma 7's breaking config changes that would have taken time to track down in the docs.

## One place where you disagreed with, corrected, or rejected AI output

I pushed back on several things during the brainstorming phase — both on system design choices and on features the AI wanted to add that were out of scope for this take-home (waitlist, email notifications, rate limiting). Keeping the scope tight required actively rejecting additions that sounded reasonable but weren't needed.

## What would you change about your AI workflow if you had to do this again?

I'd scope the brainstorming phase more tightly from the start so the AI doesn't try to add too many things at once in the beginning. Starting broad meant spending time pruning features instead of converging on the core problem faster.

## How did you verify the final implementation?

I reviewed every piece of generated code and tested the dashboard manually. For the race condition specifically, I reviewed the SKIP LOCKED implementation, then ran the CLI demo script the AI created to verify that concurrent payments against a full class result in exactly the right number of confirmations and refunds.
