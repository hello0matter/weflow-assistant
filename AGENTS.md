# Project Instructions

## GUI Configuration Rule

- For any GUI feature added in this repository, prefer a user-editable local configuration flow.
- Do not rely only on hardcoded values, source edits, or manual `.env` editing when the setting is something an end user is expected to change.
- Default approach for GUI software in this repo:
  - expose configurable items in the UI;
  - persist them locally on disk;
  - load them automatically on startup;
  - apply updates without requiring code changes.
- Environment variables and `.env` files may still be used as the storage backend, but GUI-facing settings should also have an in-app configuration surface when practical.

## Current App Expectations

- WeFlow connection settings should be configurable in the app UI and persisted locally.
- AI provider settings should be configurable in the app UI and persisted locally.
- If AI is required for a feature, the UI should clearly indicate that configuration is missing instead of silently falling back.
