import { apiClient } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  timestamp: string;
  type: 'text' | 'prescription_analysis';
  message?: string;
  error?: string;
}

export const chatApi = {
  /**
   * Gửi tin nhắn chat với AI
   * @param message - Tin nhắn của user
   * @param image - Base64 image string (optional) - cho phân tích đơn thuốc
   * @param conversationHistory - Lịch sử hội thoại (optional)
   */
  sendMessage: async (
    message: string,
    image?: string,
    conversationHistory?: ChatMessage[]
  ): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>('/chat', {
      message,
      image,
      conversationHistory: conversationHistory || [],
    });
    return response;
  },
};

