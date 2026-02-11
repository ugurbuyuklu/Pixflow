# Pixflow Feedback Exports

This folder contains automated exports of user feedback from the Pixflow application.

## 📦 What's Here

- **JSON Exports**: Feedback data exported daily in JSON format
- **HTML Viewer**: Interactive viewer to browse feedback (`feedback-viewer.html`)

## 🚀 Quick Start

### View Feedback

1. Open `feedback-viewer.html` in your browser
2. Click "Load JSON File" and select a feedback export JSON
3. Browse, filter, and analyze feedback

### Manual Export

You can trigger a manual export via API:

```bash
# Using curl (requires auth token)
curl -X POST http://localhost:3002/api/feedback/export \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Export Format

Each export file follows this structure:

```json
{
  "exportedAt": "2026-02-11T18:00:00.000Z",
  "totalCount": 42,
  "feedback": [
    {
      "id": 1,
      "user_id": 1,
      "user_name": "John Doe",
      "product_id": 2,
      "product_name": "Prompt Factory",
      "content": "Love the new features!",
      "category": "improvement",
      "created_at": "2026-02-11T15:30:00.000Z"
    }
  ]
}
```

## 📊 Categories

- **bug**: Bug reports and issues
- **feature**: Feature requests and suggestions
- **improvement**: Improvement ideas for existing features
- **other**: General feedback

## ⚙️ Auto-Export Schedule

- **Frequency**: Daily (every 24 hours)
- **First export**: On application startup
- **Location**: `exports/feedback-export-YYYY-MM-DDTHH-MM-SS.json`

## 🔒 Security Note

Export files contain user feedback data. Keep them secure and don't commit them to version control.
