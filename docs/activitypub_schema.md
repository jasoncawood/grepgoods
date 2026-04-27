# ActivityPub Inbox Schema

GrepGoods listens for ActivityPub `Create` activities containing a `Note`.

## 1. Expected `Create` Payload

When a user mentions `@market@grepgoods.space`, the bot's inbox receives a JSON-LD payload.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://instance.com/activities/123",
  "type": "Create",
  "actor": "https://instance.com/users/seller",
  "published": "2024-04-26T10:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://grepgoods.space/users/market"],
  "object": {
    "id": "https://instance.com/users/seller/statuses/12345",
    "type": "Note",
    "summary": null,
    "inReplyTo": null,
    "published": "2024-04-26T10:00:00Z",
    "url": "https://instance.com/@seller/12345",
    "attributedTo": "https://instance.com/users/seller",
    "to": ["https://www.w3.org/ns/activitystreams#Public"],
    "cc": ["https://grepgoods.space/users/market"],
    "content": "<p>Selling my extra router @market@grepgoods.space</p>",
    "tag": [
      {
        "type": "Mention",
        "href": "https://grepgoods.space/users/market",
        "name": "@market@grepgoods.space"
      }
    ],
    "attachment": [
      {
        "type": "Document",
        "mediaType": "image/jpeg",
        "url": "https://instance.com/media/router.jpg",
        "name": "Extra Router"
      }
    ]
  }
}
```

## 2. Expected `#sold` Command (Reply)

To close a listing, the user replies to their own thread.

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://instance.com/activities/456",
  "type": "Create",
  "actor": "https://instance.com/users/seller",
  "object": {
    "id": "https://instance.com/users/seller/statuses/67890",
    "type": "Note",
    "inReplyTo": "https://instance.com/users/seller/statuses/12345",
    "content": "<p>@market@grepgoods.space #sold</p>",
    "tag": [
      {
        "type": "Hashtag",
        "href": "https://instance.com/tags/sold",
        "name": "#sold"
      }
    ]
  }
}
```

## 3. Extraction Requirements (for Ollama)

The listener must pass the `object.content` and `object.attachment` to the extraction logic.

- **Item Name:** e.g., "Extra Router"
- **Price:** e.g., "50"
- **Currency:** e.g., "USD"
- **Media URLs:** Filtered list of image links.
