import { config } from '../config/index.js';
import { systemPrompt, systemInstructionGemini } from './aiPrompts.js';

// Lazy load AI clients to avoid errors if packages not installed
let openaiClient: any = null;
let geminiClient: any = null;

// Rate limiting cho Gemini API để tránh lỗi 503
// Free tier: 5 RPM (requests per minute), 20 RPD (requests per day)
// Chúng ta sẽ giới hạn ở 4 RPM để an toàn
interface RateLimitState {
  requests: number[];
  lastRequestTime: number;
}

const geminiRateLimit: RateLimitState = {
  requests: [],
  lastRequestTime: 0
};

const GEMINI_RPM_LIMIT = 4; // Giới hạn 4 requests/phút (an toàn hơn 5)
const GEMINI_MIN_DELAY_MS = 12000; // Tối thiểu 12 giây giữa các requests (60s / 5 = 12s, nhưng dùng 12s để an toàn)

/**
 * Kiểm tra và đợi nếu cần để tuân thủ rate limit của Gemini
 */
async function waitForGeminiRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Xóa các requests cũ hơn 1 phút
  geminiRateLimit.requests = geminiRateLimit.requests.filter(
    timestamp => now - timestamp < 60000
  );
  
  // Nếu đã đạt giới hạn RPM, đợi đến khi có slot
  if (geminiRateLimit.requests.length >= GEMINI_RPM_LIMIT) {
    const oldestRequest = geminiRateLimit.requests[0];
    const waitTime = 60000 - (now - oldestRequest) + 1000; // +1s buffer
    if (waitTime > 0) {
      console.log(`⏳ Gemini rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Xóa lại sau khi đợi
      geminiRateLimit.requests = geminiRateLimit.requests.filter(
        timestamp => Date.now() - timestamp < 60000
      );
    }
  }
  
  // Đảm bảo có delay tối thiểu giữa các requests (chỉ khi cần thiết)
  // Chỉ delay nếu request trước đó quá gần (< 12 giây)
  const timeSinceLastRequest = now - geminiRateLimit.lastRequestTime;
  if (timeSinceLastRequest < GEMINI_MIN_DELAY_MS && geminiRateLimit.lastRequestTime > 0) {
    const waitTime = GEMINI_MIN_DELAY_MS - timeSinceLastRequest;
    if (waitTime > 0) {
      console.log(`⏳ Gemini minimum delay: waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Ghi nhận request mới
  geminiRateLimit.requests.push(Date.now());
  geminiRateLimit.lastRequestTime = Date.now();
}

// Export initialization function for server startup
export async function initializeAIClients() {
  await initializeClients();
}

// Initialize clients on first use
async function initializeClients() {
  // Initialize OpenAI
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    try {
      // Dynamic import to avoid errors if package not installed
      const openaiModule = await import('openai');
      const OpenAI = (openaiModule as any).default || openaiModule;
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
      // IMPORTANT: Never log API key - only use it for initialization
      geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // Default to gemini-2.5-flash (stable and fast), user can override with GEMINI_MODEL
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      console.log(`✅ Google Gemini AI initialized (Model: ${modelName})`);
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error';
      console.log('⚠️ Google Gemini package not installed or error:', errorMsg.substring(0, 100));
      console.log('   Run: npm install @google/generative-ai');
      console.log('   Add GEMINI_API_KEY to environment variables (never commit to git)');
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
    queryType?: 'medical_consultation' | 'stock_inquiry' | 'price_inquiry' | 'alternative_inquiry' | 'symptom_based';
    productInfo?: any;
    originalProductName?: string;
    alternatives?: any[];
    instruction?: string;
    userQuery?: string;
    isFollowUpAnswer?: boolean;
    patientInfo?: {
      age?: number | null;
      ageGroup?: string;
      isMale?: boolean;
      isPregnant?: boolean;
      isBreastfeeding?: boolean;
      hasDrugAllergy?: boolean;
      allergyDrugs?: string[];
      hasChronicDisease?: boolean;
      chronicDiseases?: string[];
    };
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
    // Build context information
    let contextInfo = '';
    
    // Add instruction for recognizing various question formats
    contextInfo += `\n=== HƯỚNG DẪN NHẬN DIỆN CÂU HỎI ===\n`;
    contextInfo += `Người dùng có thể hỏi theo nhiều cách khác nhau:\n`;
    contextInfo += `- Câu hỏi trực tiếp: "Tôi bị cảm cúm, có thuốc nào không?"\n`;
    contextInfo += `- Mô tả triệu chứng mơ hồ: "Tôi mệt và nhức người", "Người tôi khó chịu quá"\n`;
    contextInfo += `- Câu nói tự nhiên: "Bạn ơi tôi đang bị cảm", "Nay trời lạnh quá, tôi hơi cảm rồi"\n`;
    contextInfo += `- Câu không rõ ý: "Uống cái gì cho khỏe vậy?", "Tôi mệt quá"\n`;
    contextInfo += `Bạn PHẢI tự phân tích để hiểu đúng nhu cầu của họ và hỏi lại 4 thông tin an toàn nếu cần.\n`;
    
    if (context?.medicines && context.medicines.length > 0) {
      contextInfo += `\n\nThông tin thuốc có sẵn trong hệ thống (gợi ý tối đa 3 thuốc):\n`;
      // Limit to 3 medicines max to reduce tokens
      context.medicines.slice(0, 3).forEach((med, idx) => {
        contextInfo += `${idx + 1}. ${med.name}`;
        // QUAN TRỌNG: Chỉ hiển thị công dụng (indication), KHÔNG hiển thị hàm lượng ở đây
        if (med.indication) {
          // Truncate long indications
          const shortIndication = med.indication.length > 200 
            ? med.indication.substring(0, 200) + '...' 
            : med.indication;
          contextInfo += `\n   - Tác dụng: ${shortIndication}`;
        }
        if (med.strength) {
          contextInfo += `\n   - Hàm lượng: ${med.strength}`;
        }
        if (med.price) {
          contextInfo += `\n   - Giá: ${med.price.toLocaleString('vi-VN')}đ`;
        }
        if (med.unit) {
          contextInfo += `\n   - Quy cách: ${med.unit}`;
        }
        contextInfo += '\n';
      });
      contextInfo += `\nLƯU Ý QUAN TRỌNG:\n`;
      contextInfo += `- Khi gợi ý thuốc, bạn PHẢI sử dụng trường "Tác dụng" (không phải hàm lượng) trong phần mô tả công dụng của thuốc.\n`;
      contextInfo += `- CHỈ hiển thị giá nếu có trong danh sách trên, KHÔNG tự ý đưa ra giá ước tính hoặc giá tham khảo.\n`;
      contextInfo += `- Format ngắn gọn: [Số]. **[Tên thuốc]**\n   – Tác dụng: [mô tả ngắn gọn]\n   – Liều: [liều dùng]\n`;
      contextInfo += `- Sau khi liệt kê thuốc, luôn khuyến khích: "Ngoài ra, bạn nên uống nhiều nước, giữ ấm và nghỉ ngơi."\n`;
    }

    if (context?.symptoms && context.symptoms.length > 0) {
      contextInfo += `\nTriệu chứng người dùng đã đề cập: ${context.symptoms.join(', ')}\n`;
      contextInfo += `Yêu cầu gốc: "${(context as any).userQuery || userMessage}"\n`;
      
      // If this is a follow-up answer, add explicit instruction
      if ((context as any).isFollowUpAnswer) {
        contextInfo += `\n⚠️⚠️⚠️ QUAN TRỌNG CỰC KỲ: Đây là follow-up answer. Người dùng đã cung cấp thông tin an toàn.\n`;
        contextInfo += `Bạn PHẢI:\n`;
        contextInfo += `1. Gợi ý thuốc ngay dựa trên triệu chứng "${(context as any).userQuery || ''}"\n`;
        contextInfo += `2. KHÔNG được reset hay chào lại\n`;
        contextInfo += `3. PHẢI liệt kê cụ thể từng thuốc theo format BẮT BUỘC:\n`;
        contextInfo += `   "Dưới đây là các thuốc phù hợp với tình trạng của bạn:\n\n`;
        contextInfo += `   [Số]. **[Tên thuốc]**\n`;
        contextInfo += `   - Công dụng: [mô tả]\n`;
        contextInfo += `   - Liều: [liều dùng]\n`;
        contextInfo += `   - Lưu ý: [lưu ý nếu cần]"\n`;
        contextInfo += `4. ❌ KHÔNG ĐƯỢC trả lời chung chung như:\n`;
        contextInfo += `   - "tham khảo các thuốc như..."\n`;
        contextInfo += `   - "vui lòng liên hệ dược sĩ"\n`;
        contextInfo += `   - "bạn có thể tham khảo các thuốc phổ biến như..."\n`;
        contextInfo += `5. ✅ PHẢI bắt đầu bằng: "Dưới đây là các thuốc phù hợp với tình trạng của bạn:" và liệt kê cụ thể từng thuốc\n`;
      }
      
      contextInfo += `Hãy chỉ gợi ý thuốc PHÙ HỢP với các triệu chứng này.\n`;
    }
    
    // Add explicit instruction if provided
    if ((context as any).instruction) {
      contextInfo += `\n=== HƯỚNG DẪN ĐẶC BIỆT ===\n`;
      contextInfo += `${(context as any).instruction}\n`;
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
 * Free tier: 5 RPM (requests per minute), 20 RPD (requests per day)
 */
export async function generateAIResponseWithGemini(options: AIChatOptions): Promise<string> {
  const { userMessage, conversationHistory, context } = options;

  // Initialize if not already done
  await initializeClients();

  // If Gemini is not configured, return null to use rule-based system
  if (!geminiClient) {
    console.log('⚠️ Gemini client not initialized. Check GEMINI_API_KEY in environment variables.');
    return null as any; // Signal to use fallback
  }
  
  console.log('✅ Using Gemini AI for response generation');

  // Đợi để tuân thủ rate limit trước khi gọi API
  await waitForGeminiRateLimit();

  try {
    // Get model (default: gemini-2.5-flash for stable and fast API)
    // Available models: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-flash-latest
    // Note: Older models (gemini-pro, gemini-1.5-flash) are deprecated
    let modelName: string = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    // Map old model names to new ones
    const modelMapping: { [key: string]: string } = {
      'gemini-pro': 'gemini-pro-latest',
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-pro',
      'gemini-1.5-flash-latest': 'gemini-2.5-flash'
    };
    
    if (modelName && modelMapping[modelName]) {
      modelName = modelMapping[modelName];
    }
    
    const model = geminiClient.getGenerativeModel({ model: modelName });

    const systemInstruction = systemInstructionGemini;

    // Build context information
    let contextInfo = '';
    
    // Xử lý các loại câu hỏi khác nhau
    if (context?.queryType === 'stock_inquiry' && context?.productInfo) {
      // Câu hỏi về tồn kho
      const product = context.productInfo;
      contextInfo += `\n=== THÔNG TIN TỒN KHO TỪ HỆ THỐNG ===\n`;
      contextInfo += `Khách hàng đang hỏi về tồn kho của sản phẩm.\n\n`;
      contextInfo += `Dữ liệu sản phẩm từ hệ thống nhà thuốc:\n`;
      contextInfo += `- Tên thuốc: ${product.name}\n`;
      contextInfo += `- Số lượng tồn kho: ${product.stockQuantity} ${product.unit}\n`;
      contextInfo += `- Giá bán: ${product.price.toLocaleString('vi-VN')}đ/${product.unit}\n`;
      contextInfo += `- Tình trạng: ${product.inStock ? 'Còn hàng' : 'Hết hàng'}\n\n`;
      contextInfo += `Hãy trả lời câu hỏi của khách hàng một cách lịch sự và dễ hiểu.\n`;
      contextInfo += `Nếu còn hàng, hãy thông báo số lượng và giá. Nếu hết hàng, đề xuất tìm sản phẩm thay thế.\n`;
      contextInfo += `CHỈ sử dụng thông tin được cung cấp ở trên, KHÔNG được bịa thông tin.\n`;
    } else if (context?.queryType === 'price_inquiry' && context?.productInfo) {
      // Câu hỏi về giá
      const product = context.productInfo;
      contextInfo += `\n=== THÔNG TIN GIÁ TỪ HỆ THỐNG ===\n`;
      contextInfo += `Khách hàng đang hỏi về giá của sản phẩm.\n\n`;
      contextInfo += `Dữ liệu sản phẩm từ hệ thống nhà thuốc:\n`;
      contextInfo += `- Tên thuốc: ${product.name}\n`;
      contextInfo += `- Giá bán: ${product.price.toLocaleString('vi-VN')}đ/${product.unit}\n`;
      if (product.originalPrice && product.originalPrice > product.price) {
        contextInfo += `- Giá gốc: ${product.originalPrice.toLocaleString('vi-VN')}đ\n`;
        if (product.discountPercentage > 0) {
          contextInfo += `- Giảm giá: ${product.discountPercentage}%\n`;
        }
      }
      contextInfo += `- Tình trạng: ${product.inStock ? 'Còn hàng' : 'Hết hàng'}\n\n`;
      contextInfo += `Hãy trả lời câu hỏi của khách hàng một cách lịch sự và dễ hiểu.\n`;
      contextInfo += `CHỈ sử dụng thông tin giá được cung cấp ở trên, KHÔNG được bịa giá.\n`;
    } else if (context?.queryType === 'alternative_inquiry' && context?.alternatives) {
      // Câu hỏi về thuốc thay thế
      contextInfo += `\n=== THÔNG TIN THUỐC THAY THẾ TỪ HỆ THỐNG ===\n`;
      contextInfo += `Khách hàng đang tìm thuốc thay thế cho "${context.originalProductName}".\n\n`;
      contextInfo += `Các sản phẩm tương tự hiện có trong kho:\n\n`;
      context.alternatives.forEach((alt: any, idx: number) => {
        contextInfo += `${idx + 1}. ${alt.name}\n`;
        if (alt.indication || alt.description) {
          contextInfo += `   - Hoạt chất/Công dụng: ${(alt.indication || alt.description).substring(0, 150)}\n`;
        }
        if (alt.price) {
          contextInfo += `   - Giá: ${alt.price.toLocaleString('vi-VN')}đ/${alt.unit || 'sản phẩm'}\n`;
        }
        if (alt.stockQuantity) {
          contextInfo += `   - Tồn kho: ${alt.stockQuantity} ${alt.unit || 'sản phẩm'}\n`;
        }
        contextInfo += '\n';
      });
      contextInfo += `Hãy gợi ý cho khách hàng các lựa chọn phù hợp, ngôn ngữ dễ hiểu.\n`;
      contextInfo += `Không khẳng định thay thế hoàn toàn, chỉ gợi ý các lựa chọn tương tự.\n`;
      contextInfo += `CHỈ gợi ý các sản phẩm trong danh sách trên, KHÔNG được gợi ý sản phẩm khác.\n`;
    } else {
      // Câu hỏi tư vấn y tế thông thường
      // Add instruction for recognizing various question formats
      contextInfo += `\n=== HƯỚNG DẪN NHẬN DIỆN CÂU HỎI ===\n`;
      contextInfo += `Người dùng có thể hỏi theo nhiều cách khác nhau:\n`;
      contextInfo += `- Câu hỏi trực tiếp: "Tôi bị cảm cúm, có thuốc nào không?"\n`;
      contextInfo += `- Mô tả triệu chứng mơ hồ: "Tôi mệt và nhức người", "Người tôi khó chịu quá"\n`;
      contextInfo += `- Câu nói tự nhiên: "Bạn ơi tôi đang bị cảm", "Nay trời lạnh quá, tôi hơi cảm rồi"\n`;
      contextInfo += `- Câu không rõ ý: "Uống cái gì cho khỏe vậy?", "Tôi mệt quá"\n`;
      contextInfo += `Bạn PHẢI tự phân tích để hiểu đúng nhu cầu của họ và hỏi lại 4 thông tin an toàn nếu cần.\n`;
    }
    
    if (context?.medicines && context.medicines.length > 0) {
      contextInfo += `\n\n=== THÔNG TIN THUỐC CÓ SẴN TRONG HỆ THỐNG ===\n`;
      contextInfo += `QUAN TRỌNG: Danh sách thuốc dưới đây ĐÃ ĐƯỢC LỌC và CHỈ CHỨA THUỐC PHÙ HỢP với yêu cầu của người dùng.\n`;
      contextInfo += `Bạn PHẢI chỉ gợi ý các thuốc trong danh sách này, KHÔNG được gợi ý thuốc khác.\n`;
      contextInfo += `Chỉ gợi ý 3-5 thuốc phù hợp nhất từ danh sách này.\n\n`;
      
      // Limit to 5 medicines max, prioritize by relevance
      context.medicines.slice(0, 3).forEach((med, idx) => {
        contextInfo += `${idx + 1}. **${med.name}**\n`;
        // QUAN TRỌNG: Chỉ hiển thị công dụng (indication), KHÔNG hiển thị hàm lượng ở đây
        if (med.indication) {
          // Truncate long indications
          const shortIndication = med.indication.length > 200 
            ? med.indication.substring(0, 200) + '...' 
            : med.indication;
          contextInfo += `   - Tác dụng: ${shortIndication}\n`;
        } else if (med.description) {
          const shortDesc = med.description.length > 200 
            ? med.description.substring(0, 200) + '...' 
            : med.description;
          contextInfo += `   - Tác dụng: ${shortDesc}\n`;
        }
        if (med.strength) {
          contextInfo += `   - Hàm lượng: ${med.strength}\n`;
        }
        if (med.price) {
          contextInfo += `   - Giá: ${med.price.toLocaleString('vi-VN')}đ\n`;
        }
        if (med.unit) {
          contextInfo += `   - Quy cách: ${med.unit}\n`;
        }
        if (med.stockQuantity) {
          contextInfo += `   - Tồn kho: ${med.stockQuantity} ${med.unit || 'sản phẩm'}\n`;
        }
        contextInfo += '\n';
      });
      contextInfo += `\n=== QUY TẮC QUAN TRỌNG (BẮT BUỘC) ===\n`;
      contextInfo += `1. CHỈ gợi ý các thuốc trong danh sách trên, KHÔNG được gợi ý thuốc khác.\n`;
      contextInfo += `2. Trường "Tác dụng" PHẢI là mô tả công dụng (ví dụ: "Hạ sốt, giảm đau nhẹ"), KHÔNG được ghi hàm lượng (ví dụ: "500mg" là SAI).\n`;
      contextInfo += `3. Nếu "Tác dụng" trong danh sách chỉ là hàm lượng, bạn PHẢI tạo mô tả công dụng dựa trên tên thuốc.\n`;
      contextInfo += `4. ⚠️⚠️⚠️ BẮT BUỘC CỰC KỲ: Bạn PHẢI liệt kê cụ thể từng thuốc theo format dưới đây. KHÔNG được trả lời chung chung.\n`;
      contextInfo += `   Format BẮT BUỘC (KHÔNG ĐƯỢC SAI):\n`;
      contextInfo += `   Dưới đây là các thuốc phù hợp với tình trạng của bạn:\n\n`;
      contextInfo += `   [Số]. **[Tên thuốc]** (tên thương hiệu nếu có)\n`;
      contextInfo += `   - Công dụng: [mô tả công dụng ngắn gọn, 1 dòng]\n`;
      contextInfo += `   - Liều: [liều dùng ngắn gọn] hoặc "Theo hướng dẫn bao bì / hỏi dược sĩ"\n`;
      contextInfo += `   [CHỈ hiển thị giá nếu có trong danh sách trên: 💰 Giá: [giá]đ]\n`;
      contextInfo += `   - Lưu ý: [lưu ý an toàn nếu cần]\n\n`;
      contextInfo += `   ⚠️ Lưu ý chung:\n`;
      contextInfo += `   - Không dùng chung nhiều thuốc chứa cùng hoạt chất.\n`;
      contextInfo += `   - Nếu sốt cao >39°C, khó thở, đau ngực → đi khám ngay.\n`;
      contextInfo += `   - Đọc kỹ hướng dẫn sử dụng trước khi dùng.\n\n`;
      contextInfo += `   Ngoài ra, bạn nên uống nhiều nước, giữ ấm và nghỉ ngơi.\n`;
      contextInfo += `5. ❌❌❌ KHÔNG ĐƯỢC trả lời kiểu:\n`;
      contextInfo += `   - "Tham khảo các thuốc như Paracetamol, Decolgen... vui lòng liên hệ dược sĩ"\n`;
      contextInfo += `   - "Bạn có thể tham khảo các thuốc phổ biến như..."\n`;
      contextInfo += `   - "Vui lòng liên hệ dược sĩ để được tư vấn cụ thể hơn"\n`;
      contextInfo += `6. ✅✅✅ PHẢI trả lời kiểu: Liệt kê cụ thể từng thuốc với số thứ tự, tên thuốc in đậm, công dụng, liều dùng theo đúng format trên\n`;
    }

    if (context?.symptoms && context.symptoms.length > 0) {
      contextInfo += `\n=== TRIỆU CHỨNG NGƯỜI DÙNG ===\n`;
      contextInfo += `Người dùng đã đề cập: ${context.symptoms.join(', ')}\n`;
      contextInfo += `Yêu cầu gốc: "${(context as any).userQuery || userMessage}"\n`;
      
      // Add specific symptom analysis instruction
      contextInfo += `\n⚠️⚠️⚠️ PHÂN TÍCH TRIỆU CHỨNG (BẮT BUỘC):\n`;
      contextInfo += `Bạn PHẢI phân tích ĐÚNG triệu chứng trong TIN NHẮN MỚI NHẤT và gợi ý thuốc PHÙ HỢP:\n`;
      
      const symptoms = context.symptoms;
      const userQuery = ((context as any).userQuery || userMessage).toLowerCase();
      
      // Check for specific symptoms and provide strict rules
      if (userQuery.includes('nghẹt mũi') || userQuery.includes('sổ mũi') || userQuery.includes('tắc mũi')) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Nghẹt mũi/Sổ mũi\n`;
        contextInfo += `✅ PHẢI gợi ý: Natri Clorid 0.9%, Xịt mũi muối biển, Otrivin, Naphazoline, Rhinocort\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Paracetamol, Terpin Codein, Acetylcysteine, Bromhexin (đây là thuốc ho/sốt, KHÔNG phải thuốc nghẹt mũi)\n`;
      }
      
      if (userQuery.includes('ho khan') || (userQuery.includes('ho') && !userQuery.includes('đờm'))) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Ho khan\n`;
        contextInfo += `✅ PHẢI gợi ý: Terpin Codein, Dextromethorphan\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Paracetamol, Panadol, Ibuprofen, Efferalgan (đây là thuốc sốt/đau, KHÔNG phải thuốc ho)\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Acetylcysteine, Bromhexin (chỉ dùng cho ho đờm)\n`;
      }
      
      if (userQuery.includes('ho đờm') || userQuery.includes('ho có đờm')) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Ho đờm\n`;
        contextInfo += `✅ PHẢI gợi ý: Acetylcysteine, Bromhexin, Ambroxol, Prospan\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Terpin Codein (chỉ dùng cho ho khan)\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Paracetamol, Panadol (đây là thuốc sốt/đau)\n`;
      }
      
      if (userQuery.includes('đau đầu') || userQuery.includes('nhức đầu')) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Đau đầu\n`;
        contextInfo += `✅ PHẢI gợi ý: Paracetamol, Ibuprofen\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Decolgen, Tiffy (trừ khi có nghẹt mũi/sổ mũi kèm theo)\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Terpin Codein, Acetylcysteine (đây là thuốc ho)\n`;
      }
      
      if (userQuery.includes('sốt') && !userQuery.includes('cảm') && !userQuery.includes('cúm')) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Sốt\n`;
        contextInfo += `✅ PHẢI gợi ý: Paracetamol, Panadol, Efferalgan\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG tự thêm: Decolgen, Tiffy (chỉ thêm nếu có nghẹt mũi kèm theo)\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Terpin Codein, Acetylcysteine (đây là thuốc ho)\n`;
      }
      
      if (userQuery.includes('cảm cúm') || (userQuery.includes('cảm') && (userQuery.includes('sốt') || userQuery.includes('đau đầu') || userQuery.includes('nghẹt mũi')))) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Cảm cúm (nhiều triệu chứng)\n`;
        contextInfo += `✅ PHẢI gợi ý combo: Paracetamol + Decolgen/Tiffy\n`;
      }
      
      if (userQuery.includes('mệt') || userQuery.includes('nhức người') || userQuery.includes('khó chịu')) {
        contextInfo += `\n🔍 TRIỆU CHỨNG: Mệt mỏi/Nhức người (MƠ HỒ)\n`;
        contextInfo += `⚠️ BẠN PHẢI HỎI LẠI triệu chứng cụ thể: "Bạn có sốt, đau đầu, nghẹt mũi, ho hay triệu chứng nào khác không?"\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG được gợi ý thuốc khi triệu chứng mơ hồ\n`;
        contextInfo += `❌ TUYỆT ĐỐI KHÔNG gợi ý: Terpin Codein, Acetylcysteine (đây là thuốc ho, không phải thuốc mệt mỏi)\n`;
      }
      
      contextInfo += `\n⚠️⚠️⚠️ QUY TẮC CHẶT CHẼ:\n`;
      contextInfo += `1. KHÔNG được tái sử dụng danh sách thuốc từ câu trả lời trước\n`;
      contextInfo += `2. KHÔNG được gợi ý thuốc ho cho nghẹt mũi hoặc sốt\n`;
      contextInfo += `3. KHÔNG được gợi ý thuốc sốt/đau cho ho\n`;
      contextInfo += `4. Mỗi triệu chứng PHẢI có danh sách thuốc RIÊNG\n`;
      contextInfo += `5. Trước khi trả lời, TỰ KIỂM TRA: Thuốc có đúng triệu chứng không? Có bị lặp không?\n`;
      
      // If this is a follow-up answer, add explicit instruction
      if ((context as any).isFollowUpAnswer) {
        contextInfo += `\n⚠️⚠️⚠️ QUAN TRỌNG CỰC KỲ: Đây là follow-up answer. Người dùng đã cung cấp thông tin an toàn.\n`;
        contextInfo += `Bạn PHẢI:\n`;
        contextInfo += `1. Gợi ý thuốc ngay dựa trên triệu chứng "${(context as any).userQuery || ''}"\n`;
        contextInfo += `2. KHÔNG được reset hay chào lại\n`;
        contextInfo += `3. PHẢI liệt kê cụ thể từng thuốc theo format BẮT BUỘC:\n`;
        contextInfo += `   "Dưới đây là các thuốc phù hợp với tình trạng của bạn:\n\n`;
        contextInfo += `   [Số]. **[Tên thuốc]**\n`;
        contextInfo += `   - Công dụng: [mô tả]\n`;
        contextInfo += `   - Liều: [liều dùng]\n`;
        contextInfo += `   - Lưu ý: [lưu ý nếu cần]"\n`;
        contextInfo += `4. ❌ KHÔNG ĐƯỢC trả lời chung chung như:\n`;
        contextInfo += `   - "tham khảo các thuốc như..."\n`;
        contextInfo += `   - "vui lòng liên hệ dược sĩ"\n`;
        contextInfo += `   - "bạn có thể tham khảo các thuốc phổ biến như..."\n`;
        contextInfo += `5. ✅ PHẢI bắt đầu bằng: "Dưới đây là các thuốc phù hợp với tình trạng của bạn:" và liệt kê cụ thể từng thuốc\n`;
      }
      
      contextInfo += `Bạn PHẢI chỉ gợi ý thuốc PHÙ HỢP với triệu chứng này từ danh sách thuốc đã được lọc ở trên.\n`;
    }
    
    // Add explicit instruction if provided
    if ((context as any).instruction) {
      contextInfo += `\n=== HƯỚNG DẪN ĐẶC BIỆT ===\n`;
      contextInfo += `${(context as any).instruction}\n`;
    }
    
    // Nếu cần làm rõ triệu chứng (đặc biệt với "thuốc tiêu hóa")
    if ((context as any).queryType === 'symptom_clarification_needed') {
      contextInfo += `\n⚠️⚠️⚠️ QUAN TRỌNG: Người dùng chỉ hỏi chung chung về "thuốc tiêu hóa" mà chưa có triệu chứng cụ thể.\n`;
      contextInfo += `Bạn PHẢI hỏi lại triệu chứng cụ thể trước khi tư vấn thuốc.\n`;
      contextInfo += `KHÔNG được tư vấn thuốc khi chưa biết triệu chứng cụ thể.\n`;
    }

    // Thêm thông tin bệnh nhân vào context
    if (context?.patientInfo) {
      const patient = context.patientInfo;
      contextInfo += `\n=== THÔNG TIN BỆNH NHÂN (QUAN TRỌNG) ===\n`;
      
      if (patient.age !== null && patient.age !== undefined) {
        contextInfo += `- Tuổi: ${patient.age} tuổi\n`;
        
        // Phân loại độ tuổi
        if (patient.age >= 0 && patient.age < 1) {
          contextInfo += `  → Nhóm: Trẻ sơ sinh (0 - < 1 tuổi)\n`;
          contextInfo += `  ⚠️ CHỈ được dùng: Men vi sinh dạng giọt, thuốc theo chỉ định bác sĩ\n`;
          contextInfo += `  ❌ KHÔNG được dùng: Thuốc kháng acid, cầm tiêu chảy tự ý\n`;
          contextInfo += `  ⚠️ QUAN TRỌNG: Cần hỏi thêm cân nặng của trẻ để tính liều chính xác\n`;
        } else if (patient.age >= 1 && patient.age < 6) {
          contextInfo += `  → Nhóm: Trẻ nhỏ (1 - < 6 tuổi)\n`;
          contextInfo += `  ⚠️ Thường dùng: Men vi sinh, Oresol, Siro tiêu hóa\n`;
          contextInfo += `  ❌ KHÔNG được dùng: Thuốc người lớn\n`;
          contextInfo += `  ⚠️ QUAN TRỌNG: Cần hỏi thêm cân nặng của trẻ để tính liều chính xác\n`;
          contextInfo += `  ⚠️ Nếu trẻ có: Tiêu chảy > 2 ngày, nôn nhiều, sốt cao, phân có máu → PHẢI yêu cầu đi khám bác sĩ ngay\n`;
        } else if (patient.age >= 6 && patient.age < 12) {
          contextInfo += `  → Nhóm: Trẻ em (6 - < 12 tuổi)\n`;
          contextInfo += `  ⚠️ Có thể dùng nhiều thuốc hơn nhưng liều thấp hơn người lớn\n`;
          contextInfo += `  ⚠️ QUAN TRỌNG: Cần hỏi thêm cân nặng của trẻ để tính liều chính xác\n`;
          contextInfo += `  ⚠️ Nếu trẻ có: Tiêu chảy > 2 ngày, nôn nhiều, sốt cao, phân có máu → PHẢI yêu cầu đi khám bác sĩ ngay\n`;
        } else if (patient.age >= 12) {
          contextInfo += `  → Nhóm: Người lớn (≥ 12 tuổi)\n`;
          contextInfo += `  ⚠️ KHÔNG được gợi ý thuốc trẻ em (trừ khi thuốc dùng chung cho cả trẻ em và người lớn)\n`;
        }
      } else if (patient.ageGroup) {
        contextInfo += `- Nhóm tuổi: ${patient.ageGroup}\n`;
        if (patient.ageGroup === 'infant' || patient.ageGroup === 'toddler' || patient.ageGroup === 'child') {
          contextInfo += `  ⚠️ QUAN TRỌNG: Cần hỏi thêm cân nặng của trẻ để tính liều chính xác\n`;
          contextInfo += `  ⚠️ Nếu trẻ có: Tiêu chảy > 2 ngày, nôn nhiều, sốt cao, phân có máu → PHẢI yêu cầu đi khám bác sĩ ngay\n`;
        }
      }
      
      if (patient.isMale) {
        contextInfo += `- Giới tính: Nam\n`;
        contextInfo += `  → Không mang thai và không cho con bú\n`;
      } else if (patient.isPregnant) {
        contextInfo += `- Tình trạng: Đang mang thai\n`;
        contextInfo += `  ⚠️⚠️⚠️ QUAN TRỌNG: PHẢI đề xuất thuốc an toàn cho phụ nữ mang thai\n`;
        contextInfo += `  ❌ KHÔNG được gợi ý: Ibuprofen, Aspirin, NSAID, Corticoid (trừ khi có chỉ định bác sĩ)\n`;
        contextInfo += `  ✅ Ưu tiên: Paracetamol (an toàn cho thai kỳ), Men vi sinh, Oresol\n`;
      } else if (patient.isBreastfeeding) {
        contextInfo += `- Tình trạng: Đang cho con bú\n`;
        contextInfo += `  ⚠️⚠️⚠️ QUAN TRỌNG: PHẢI đề xuất thuốc an toàn cho phụ nữ cho con bú\n`;
        contextInfo += `  ❌ KHÔNG được gợi ý: Ibuprofen, Aspirin, NSAID (trừ khi có chỉ định bác sĩ)\n`;
        contextInfo += `  ✅ Ưu tiên: Paracetamol (an toàn khi cho con bú), Men vi sinh\n`;
      } else {
        contextInfo += `- Tình trạng: Không mang thai và không cho con bú\n`;
      }
      
      if (patient.hasDrugAllergy && patient.allergyDrugs && patient.allergyDrugs.length > 0) {
        contextInfo += `- Dị ứng thuốc: CÓ - ${patient.allergyDrugs.join(', ')}\n`;
        contextInfo += `  ⚠️⚠️⚠️ TUYỆT ĐỐI KHÔNG được gợi ý thuốc dị ứng hoặc thuốc cùng nhóm\n`;
        contextInfo += `  ❌ Nếu dị ứng ${patient.allergyDrugs.join(' hoặc ')}, KHÔNG được gợi ý thuốc đó\n`;
      } else {
        contextInfo += `- Dị ứng thuốc: Không có\n`;
      }
      
      if (patient.hasChronicDisease && patient.chronicDiseases && patient.chronicDiseases.length > 0) {
        contextInfo += `- Bệnh nền: CÓ - ${patient.chronicDiseases.join(', ')}\n`;
        contextInfo += `  ⚠️⚠️⚠️ PHẢI tránh thuốc có chống chỉ định với bệnh nền\n`;
        
        if (patient.chronicDiseases.some(d => d.includes('gan'))) {
          contextInfo += `  ❌ Bệnh gan: Tránh thuốc chuyển hóa qua gan, thận trọng với Paracetamol\n`;
        }
        if (patient.chronicDiseases.some(d => d.includes('thận'))) {
          contextInfo += `  ❌ Bệnh thận: Tránh Ibuprofen, NSAID, thận trọng với thuốc chuyển hóa qua thận\n`;
        }
        if (patient.chronicDiseases.some(d => d.includes('dạ dày') || d.includes('bao tử'))) {
          contextInfo += `  ❌ Bệnh dạ dày: Tránh Ibuprofen, Aspirin, NSAID (kích ứng dạ dày)\n`;
        }
        if (patient.chronicDiseases.some(d => d.includes('tim') || d.includes('huyết áp'))) {
          contextInfo += `  ❌ Bệnh tim/huyết áp: Tránh thuốc ảnh hưởng tim mạch\n`;
        }
      } else {
        contextInfo += `- Bệnh nền: Không có\n`;
      }
      
      contextInfo += `\n⚠️⚠️⚠️ QUY TẮC BẮT BUỘC:\n`;
      contextInfo += `1. CHỈ gợi ý thuốc PHÙ HỢP với tất cả điều kiện trên\n`;
      contextInfo += `2. Nếu không có thuốc phù hợp trong danh sách hệ thống cung cấp, PHẢI nói rõ và đề xuất liên hệ dược sĩ\n`;
      contextInfo += `3. KHÔNG được gợi ý thuốc không phù hợp với độ tuổi, mang thai, bệnh nền, dị ứng\n`;
      contextInfo += `4. Nếu người dùng là người lớn (≥12 tuổi), KHÔNG được gợi ý thuốc trẻ em (trừ khi thuốc dùng chung)\n`;
      contextInfo += `5. Nếu người dùng là trẻ em, KHÔNG được gợi ý thuốc người lớn\n`;
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
    if (conversationHistory.length > 0 && conversationHistory[0]?.role === 'assistant') {
      skipFirst = true;
    }
    
    for (let i = 0; i < conversationHistory.length; i++) {
      const msg = conversationHistory[i];
      
      // Skip if message is undefined
      if (!msg) {
        continue;
      }
      
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
    const fullSystemInstruction = systemInstructionGemini + contextInfo;
    
    // Retry logic với exponential backoff cho lỗi 503
    const maxRetries = 3;
    let aiResponse: string | null = null;
    let lastError: any = null;
    
    const { withGeminiSemaphore } = await import('./geminiRuntime.js');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        aiResponse = await withGeminiSemaphore(async () => {
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

          const result = await chat.sendMessage(userMessage);
          const response = await result.response;
          return response.text();
        });

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        lastError = error;
        const errorStatus = error?.status || error?.response?.status || 'N/A';
        const errorMessage = error?.message || 'Unknown error';
        
        // Nếu là lỗi 503 (Service Unavailable) và chưa hết số lần retry
        if ((errorStatus === 503 || errorMessage?.includes('503') || errorMessage?.includes('overloaded') || errorMessage?.includes('Service Unavailable')) && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`⚠️ Gemini API overloaded (503), retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          // Không phải lỗi 503 hoặc đã hết số lần retry, throw error
          throw error;
        }
      }
    }
    
    // Nếu không có response sau tất cả các lần retry, throw error
    if (!aiResponse && lastError) {
      throw lastError;
    }
    
    // Nếu có response, tiếp tục xử lý
    if (!aiResponse) {
      throw new Error('No response from Gemini API after retries');
    }
    
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
    // Log error without exposing sensitive information
    const errorMessage = error?.message || 'Unknown error';
    const errorStatus = error?.status || 'N/A';
    
    // Handle specific error types
    if (errorStatus === 403 || errorMessage?.includes('403') || errorMessage?.includes('Forbidden')) {
      if (errorMessage?.includes('leaked') || errorMessage?.includes('API key')) {
        console.error('❌ Gemini API key issue detected. Please check your GEMINI_API_KEY in environment variables.');
        console.error('   Error: API key was reported as leaked or invalid');
      } else {
        console.error('❌ Gemini API access forbidden (403). Check API key permissions.');
      }
    } else if (errorStatus === 429 || errorMessage?.includes('429') || errorMessage?.includes('quota') || errorMessage?.includes('rate limit')) {
      console.log('⚠️ Gemini API rate limit reached, falling back to rule-based system');
    } else if (errorStatus === 503 || errorMessage?.includes('503') || errorMessage?.includes('overloaded') || errorMessage?.includes('Service Unavailable')) {
      console.log('⚠️ Gemini API service unavailable (503 - model overloaded), falling back to rule-based system');
      console.log('   This usually means the model is temporarily overloaded. The system will use rule-based fallback.');
    } else if (errorMessage?.includes('fetch failed') || errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('network') || errorMessage?.includes('ENOTFOUND')) {
      // Network errors - don't log too much detail, just use fallback
      console.log('⚠️ Gemini API network error. Using rule-based fallback.');
    } else {
      // Log generic error without full error object (may contain sensitive info)
      // Only log first 100 chars to avoid spam
      const shortError = errorMessage.substring(0, 100);
      console.error(`❌ Error calling Gemini API (Status: ${errorStatus}): ${shortError}`);
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

    // Set timeout for Ollama request (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null as any;
    }

    const data = await response.json();
    return data.message?.content || null as any;
  } catch (error: any) {
    // Don't log ECONNREFUSED errors too verbosely (Ollama is optional)
    const errorMessage = error?.message || '';
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      // Ollama server not running - this is expected if not using Ollama
      // Only log once per session to avoid spam
      if (!(global as any).ollamaErrorLogged) {
        console.log('ℹ️ Ollama server not available (optional). Using rule-based fallback.');
        (global as any).ollamaErrorLogged = true;
      }
    } else {
      console.error('Error calling Ollama:', errorMessage.substring(0, 100));
    }
    return null as any;
  }
}
