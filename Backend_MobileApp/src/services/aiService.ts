import { config } from '../config/index.js';

// Lazy load AI clients to avoid errors if packages not installed
let openaiClient: any = null;
let geminiClient: any = null;

// Export initialization function for server startup
export async function initializeAIClients() {
  await initializeClients();
}

// Initialize clients on first use
async function initializeClients() {
  // Initialize OpenAI
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ OpenAI initialized');
    } catch (error) {
      console.log('⚠️ OpenAI package not installed');
    }
  }

  // Initialize Gemini
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // Default to gemini-2.5-flash (stable and fast), user can override with GEMINI_MODEL
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      console.log(`✅ Google Gemini AI initialized (Model: ${modelName})`);
    } catch (error: any) {
      console.log('⚠️ Google Gemini package not installed or error:', error.message);
      console.log('   Run: npm install @google/generative-ai');
      console.log('   Add GEMINI_API_KEY to .env file');
    }
  } else if (!process.env.GEMINI_API_KEY) {
    console.log('ℹ️ GEMINI_API_KEY not found in environment variables');
  }
}

// Alternative: Use other AI services
// - Google Gemini API
// - Anthropic Claude API
// - Local LLM (Ollama, LM Studio)
// - Vietnamese LLM (VinAI, FPT AI)

interface AIChatOptions {
  userMessage: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    medicines?: any[];
    userHistory?: any[];
    symptoms?: string[];
  };
}

/**
 * Generate AI response using OpenAI GPT
 * Fallback to rule-based system if API key not configured
 */
export async function generateAIResponseWithLLM(options: AIChatOptions): Promise<string> {
  const { userMessage, conversationHistory, context } = options;

  // Initialize if not already done
  await initializeClients();

  // If OpenAI is not configured, return null to use rule-based system
  if (!openaiClient) {
    return null as any; // Signal to use fallback
  }

  try {
    // Build system prompt for pharmacy assistant
    const systemPrompt = `Bạn là trợ lý AI chuyên về dược phẩm của Nhà Thuốc Thông Minh. Nhiệm vụ của bạn:

1. Tư vấn thông tin thuốc một cách chính xác và an toàn
2. Gợi ý thuốc phù hợp dựa trên triệu chứng (chỉ OTC - không cần đơn)
3. Cung cấp thông tin về công dụng, liều dùng tham khảo, chống chỉ định
4. Luôn cảnh báo người dùng về các tình trạng nghiêm trọng cần đi khám bác sĩ
5. Không đưa ra chỉ định điều trị cụ thể, chỉ cung cấp thông tin tham khảo
6. Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp

QUAN TRỌNG:
- Không được thay thế chỉ định của bác sĩ
- Luôn khuyến khích tham khảo ý kiến dược sĩ/bác sĩ
- Cảnh báo ngay khi phát hiện tình trạng nghiêm trọng (sốt cao, đau ngực, v.v.)
- Không bán kháng sinh không cần đơn`;

    // Build context information
    let contextInfo = '';
    if (context?.medicines && context.medicines.length > 0) {
      contextInfo += `\n\nThông tin thuốc có sẵn trong hệ thống:\n`;
      context.medicines.slice(0, 5).forEach((med, idx) => {
        contextInfo += `${idx + 1}. ${med.name}`;
        if (med.indication) contextInfo += ` - Công dụng: ${med.indication}`;
        if (med.price) contextInfo += ` - Giá: ${med.price.toLocaleString('vi-VN')}đ`;
        contextInfo += '\n';
      });
    }

    if (context?.symptoms && context.symptoms.length > 0) {
      contextInfo += `\nTriệu chứng người dùng: ${context.symptoms.join(', ')}\n`;
    }

    // Build messages for OpenAI
    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt + contextInfo
      },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      {
        role: 'user',
        content: userMessage
      }
    ];

    // Call OpenAI API
    const completion = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', // Use gpt-4o-mini for cost efficiency, or gpt-4o for better quality
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';
    return aiResponse;

  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    // Fallback to rule-based system on error
    return null as any;
  }
}

/**
 * Generate AI response using Google Gemini API
 * Free tier: 15 requests per minute, 1500 requests per day
 */
export async function generateAIResponseWithGemini(options: AIChatOptions): Promise<string> {
  const { userMessage, conversationHistory, context } = options;

  // Initialize if not already done
  await initializeClients();

  // If Gemini is not configured, return null to use rule-based system
  if (!geminiClient) {
    return null as any; // Signal to use fallback
  }

  try {
    // Get model (default: gemini-2.5-flash for stable and fast API)
    // Available models: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-flash-latest
    // Note: Older models (gemini-pro, gemini-1.5-flash) are deprecated
    let modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    // Map old model names to new ones
    const modelMapping: { [key: string]: string } = {
      'gemini-pro': 'gemini-pro-latest',
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-pro',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash'
    };
    
    if (modelMapping[modelName]) {
      modelName = modelMapping[modelName];
    }
    
    const model = geminiClient.getGenerativeModel({ model: modelName });

    // Build system instruction for pharmacy assistant
    const systemInstruction = `Bạn là trợ lý AI chuyên về dược phẩm của Nhà Thuốc Thông Minh. Nhiệm vụ của bạn:

1. Tư vấn thông tin thuốc một cách chính xác và an toàn
2. Gợi ý thuốc phù hợp dựa trên triệu chứng (chỉ OTC - không cần đơn)
3. Cung cấp thông tin về công dụng, liều dùng tham khảo, chống chỉ định
4. Luôn cảnh báo người dùng về các tình trạng nghiêm trọng cần đi khám bác sĩ
5. Không đưa ra chỉ định điều trị cụ thể, chỉ cung cấp thông tin tham khảo
6. Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp

QUAN TRỌNG:
- Không được thay thế chỉ định của bác sĩ
- Luôn khuyến khích tham khảo ý kiến dược sĩ/bác sĩ
- Cảnh báo ngay khi phát hiện tình trạng nghiêm trọng (sốt cao, đau ngực, v.v.)
- Không bán kháng sinh không cần đơn
- Chỉ gợi ý thuốc OTC (không cần đơn bác sĩ)`;

    // Build context information
    let contextInfo = '';
    if (context?.medicines && context.medicines.length > 0) {
      contextInfo += `\n\nThông tin thuốc có sẵn trong hệ thống:\n`;
      context.medicines.slice(0, 5).forEach((med, idx) => {
        contextInfo += `${idx + 1}. ${med.name}`;
        if (med.indication) contextInfo += ` - Công dụng: ${med.indication}`;
        if (med.price) contextInfo += ` - Giá: ${med.price.toLocaleString('vi-VN')}đ`;
        if (med.stockQuantity) contextInfo += ` - Tồn kho: ${med.stockQuantity} ${med.unit || 'sản phẩm'}`;
        contextInfo += '\n';
      });
    }

    if (context?.symptoms && context.symptoms.length > 0) {
      contextInfo += `\nTriệu chứng người dùng: ${context.symptoms.join(', ')}\n`;
    }

    if (context?.userHistory && context.userHistory.length > 0) {
      contextInfo += `\nLịch sử mua hàng của người dùng:\n`;
      context.userHistory.slice(0, 3).forEach((item, idx) => {
        contextInfo += `${idx + 1}. ${item.productName}\n`;
      });
    }

    // Build conversation history for Gemini
    // Gemini requires: first message must be from 'user', not 'model'
    // Format: parts array with text
    const chatHistory: any[] = [];
    
    // Filter and add conversation history
    // Skip if history starts with 'assistant' (model) - Gemini doesn't allow this
    let skipFirst = false;
    if (conversationHistory.length > 0 && conversationHistory[0].role === 'assistant') {
      skipFirst = true;
    }
    
    for (let i = 0; i < conversationHistory.length; i++) {
      const msg = conversationHistory[i];
      
      // Skip first message if it's from assistant
      if (i === 0 && skipFirst) {
        continue;
      }
      
      if (msg.role === 'user') {
        chatHistory.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        chatHistory.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Start chat session
    // systemInstruction must be an object with parts array, not a string
    const fullSystemInstruction = systemInstruction + contextInfo;
    const chat = model.startChat({
      history: chatHistory.length > 0 ? chatHistory : undefined, // Only include if not empty
      systemInstruction: {
        parts: [{ text: fullSystemInstruction }]
      },
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096, // Increased to prevent response truncation
      },
    });

    // Send user message
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    let aiResponse = response.text();
    
    // Check if response was truncated (ends abruptly)
    // Gemini sometimes truncates if maxOutputTokens is reached
    if (aiResponse && aiResponse.length > 0) {
      console.log(`✅ Gemini response received (${aiResponse.length} characters)`);
      
      // If response seems incomplete (ends mid-sentence), log a warning
      const lastChar = aiResponse.trim().slice(-1);
      if (!['.', '!', '?', ':', ';'].includes(lastChar) && aiResponse.length > 1000) {
        console.log('⚠️ Response might be truncated (does not end with punctuation)');
      }
    }

    return aiResponse;

  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    
    // Handle rate limit errors
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      console.log('⚠️ Gemini API rate limit reached, falling back to rule-based system');
    }
    
    // Fallback to rule-based system on error
    return null as any;
  }
}

/**
 * Generate AI response using Anthropic Claude API (Alternative)
 */
export async function generateAIResponseWithClaude(options: AIChatOptions): Promise<string> {
  // Implementation for Anthropic Claude API
  // Requires: npm install @anthropic-ai/sdk
  // import Anthropic from '@anthropic-ai/sdk';
  // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // ...
  return null as any;
}

/**
 * Generate AI response using local LLM (Ollama) - Free alternative
 */
export async function generateAIResponseWithOllama(options: AIChatOptions): Promise<string> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2:3b'; // or 'mistral', 'phi3', etc.

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'Bạn là trợ lý AI chuyên về dược phẩm. Trả lời bằng tiếng Việt, chính xác và an toàn.'
          },
          ...options.conversationHistory,
          { role: 'user', content: options.userMessage }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      return null as any;
    }

    const data = await response.json();
    return data.message?.content || null as any;
  } catch (error) {
    console.error('Error calling Ollama:', error);
    return null as any;
  }
}

