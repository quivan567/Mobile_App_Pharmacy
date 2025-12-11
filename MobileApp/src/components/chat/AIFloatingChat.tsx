import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { chatApi, ChatMessage } from '../../api/chat';
import { COLORS } from '../../utils/constants';
import Toast from 'react-native-toast-message';
import { logger } from '../../utils/logger';

interface Message extends ChatMessage {
  id: string;
  imagePreview?: string;
  timestamp: number;
}

const initialAssistantMessage: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Xin chào! Tôi là trợ lý AI của Nhà Thuốc Thông Minh. Tôi có thể hỗ trợ tìm thông tin thuốc, gợi ý sản phẩm hoặc phân tích ảnh đơn thuốc.',
  timestamp: Date.now(),
};

export function AIFloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([initialAssistantMessage]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const conversationHistory: ChatMessage[] = useMemo(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({
        type: 'info',
        text1: 'Cần quyền truy cập ảnh',
        text2: 'Vui lòng cấp quyền thư viện ảnh để gửi hình',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      base64: true,
      quality: 0.75,
    });

    if (!result.canceled && result.assets?.[0]?.base64 && result.assets?.[0]?.uri) {
      const mimeType = result.assets[0].mimeType || 'image/jpeg';
      setSelectedImage({
        uri: result.assets[0].uri,
        base64: `data:${mimeType};base64,${result.assets[0].base64}`,
      });
    }
  };

  const removeImage = () => setSelectedImage(null);

  const handleSend = async () => {
    const messageText = input.trim() || (selectedImage ? 'Phân tích đơn thuốc này' : '');
    if (!messageText || isSending) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: messageText,
      imagePreview: selectedImage?.uri,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const imagePayload = selectedImage?.base64;
    setSelectedImage(null);
    setIsSending(true);

    try {
      const response = await chatApi.sendMessage(messageText, imagePayload, conversationHistory);
      const assistantMessage: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.response || response.message || 'Tôi chưa thể trả lời câu hỏi này, bạn thử lại nhé.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      logger.error('AIFloatingChat send error', error);
      Toast.show({
        type: 'error',
        text1: 'Gửi thất bại',
        text2: 'Không thể gửi tin nhắn, vui lòng thử lại.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageRow,
        item.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
      ]}
    >
      {item.role === 'assistant' && (
        <View style={styles.avatarAssistant}>
          <Ionicons name="medkit" size={18} color="#fff" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {item.imagePreview && (
          <Image source={{ uri: item.imagePreview }} style={styles.preview} resizeMode="cover" />
        )}
        <Text style={item.role === 'user' ? styles.textUser : styles.textAssistant}>
          {item.content}
        </Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      {item.role === 'user' && (
        <View style={styles.avatarUser}>
          <Ionicons name="person" size={18} color="#fff" />
        </View>
      )}
    </View>
  );

  return (
    <>
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={() => setIsOpen(true)}>
          <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Trợ lý AI</Text>
                <Text style={styles.modalSubtitle}>Chat và phân tích đơn thuốc</Text>
              </View>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              style={styles.messages}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            />

            {selectedImage && (
              <View style={styles.previewRow}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewSmall} />
                <TouchableOpacity onPress={removeImage} style={styles.removeImageBtn}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
              <View style={styles.inputRow}>
                <TouchableOpacity onPress={pickImage} style={styles.iconButton} disabled={isSending}>
                  <Ionicons name="image" size={22} color={COLORS.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder={
                    selectedImage
                      ? 'Thêm mô tả cho hình ảnh (tùy chọn)...'
                      : 'Nhập câu hỏi hoặc nội dung cần tư vấn...'
                  }
                  placeholderTextColor="#777"
                  value={input}
                  onChangeText={setInput}
                  editable={!isSending}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleSend}
                  style={[styles.iconButton, styles.sendButton, isSending && styles.sendDisabled]}
                  disabled={isSending}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 20,
  },
  fab: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 999,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    height: '60%', // mở chiếm khoảng nửa màn hình
    maxHeight: '85%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: COLORS.primary,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#f0f0f0',
    marginTop: 4,
  },
  closeButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 12,
    padding: 10,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    marginLeft: 12,
  },
  bubbleAssistant: {
    backgroundColor: '#f1f5f9',
    marginRight: 12,
  },
  textUser: {
    color: '#fff',
  },
  textAssistant: {
    color: '#111827',
  },
  timestamp: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'right',
  },
  avatarAssistant: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarUser: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  preview: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  previewSmall: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  removeImageBtn: {
    marginLeft: 10,
    backgroundColor: COLORS.error,
    padding: 6,
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    backgroundColor: '#fff',
  },
  iconButton: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  sendButton: {
    backgroundColor: COLORS.primary,
  },
  sendDisabled: {
    opacity: 0.7,
  },
});


