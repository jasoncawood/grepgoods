import { Ollama } from 'ollama';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const ollama = new Ollama({ host: ollamaHost });

export interface ExtractedData {
  itemName: string;
  price: number;
  currency: string;
  hashtags: string[];
  isProhibited: boolean;
  safetyReason?: string;
}

export async function extractItemDetails(content: string): Promise<ExtractedData> {
  const prompt = `
    You are a data extraction and safety assistant for a decentralized marketplace.
    Extract the following details from the given marketplace listing text:
    1. Item Name
    2. Price (as a number)
    3. Currency (ISO code or symbol)
    4. 3 context-aware hashtags for categorization
    5. Is Prohibited: Check if the item is a weapon, drug, adult content, or illegal service.

    Return the result ONLY as a clean JSON object.
    
    Listing Text: "${content.replace(/<[^>]*>?/gm, '')}"

    Example Output:
    {
      "itemName": "Vintage Camera",
      "price": 45.00,
      "currency": "USD",
      "hashtags": ["#Photography", "#Vintage"],
      "isProhibited": false
    }
  `;

  try {
    const response = await ollama.generate({
      model: 'llama3', // Defaulting to llama3, user might need to pull it
      prompt: prompt,
      format: 'json',
      stream: false
    });

    return JSON.parse(response.response) as ExtractedData;
  } catch (error) {
    console.error('Ollama extraction error:', error);
    return {
      itemName: 'Unknown Item',
      price: 0,
      currency: '???',
      hashtags: [],
      isProhibited: false
    };
  }
}
