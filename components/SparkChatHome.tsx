import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Defs, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from 'react-native-svg';

type Props = {
  userName?: string;
  placeholder?: string;
  onSend?: (text: string) => void;
};

const SparkChatHome: React.FC<Props> = ({ userName = 'Sam', placeholder = 'Ask any question', onSend }) => {
  const [value, setValue] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [messages, setMessages] = React.useState<Array<{ id: number; role: 'user' | 'bot' | 'loading'; text: string }>>([]);
  const idRef = useRef<number>(1);
  const scrollRef = useRef<ScrollView | null>(null);

  const handleSend = () => {
    // keep compatibility for external onSend handlers
    if (!value) return;
    onSend?.(value);
    setValue('');
  };

  // Read the Spark Chat endpoint from environment so it can be changed without editing source.
  // Expo exposes variables prefixed with EXPO_PUBLIC_ to the app at runtime.
  const endpointUrl = process.env.EXPO_PUBLIC_SPARK_CHAT_ENDPOINT ?? "";
  if (!endpointUrl) {
    console.warn("⚠️ EXPO_PUBLIC_SPARK_CHAT_ENDPOINT is not set. Please add it to your .env file.");
  }

  const sendToEndpoint = async (text: string) => {
    if (!text || sending) return;
    setSending(true);

    // build history payload from existing messages (exclude loading) and include this user message
    const historyPayload = messages
      .filter((m) => m.role !== 'loading')
      .map((m) => ({ role: m.role === 'user' ? 'userMessage' : 'apiMessage', content: m.text }));
    // include current user message in history as the last userMessage
    historyPayload.push({ role: 'userMessage', content: text });

    // add user and loading placeholders to UI
    const userId = idRef.current++;
    const loadingId = idRef.current++;
    setMessages((m) => [...m, { id: userId, role: 'user', text }, { id: loadingId, role: 'loading', text: '__LOADING__' }]);
    // clear the input immediately once the message is submitted
    setValue('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);

    try {
      // Use the expected payload shape for this endpoint: { question: string }
      const payload: Record<string, unknown> = { question: text };
      if (historyPayload.length) payload.history = historyPayload;
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      console.log('Spark Chat response:', json);

      // Extract only text content from the API response.
      // Prefer text fields and first string items; never show the full JSON object.
      const extractText = (obj: any): string => {
        if (!obj) return '';

        // 1) common shape: { data: ["string"] } or { data: [{ text, answer, response, generated_text }] }
        if (Array.isArray(obj.data)) {
          const first = obj.data[0];
          if (typeof first === 'string') return first;
          // if first entry is an object with a text field
          if (first && typeof first === 'object') {
            if (typeof first.text === 'string' && first.text.trim()) return first.text;
            if (typeof first.answer === 'string' && first.answer.trim()) return first.answer;
            if (typeof first.response === 'string' && first.response.trim()) return first.response;
            if (typeof first.generated_text === 'string' && first.generated_text.trim()) return first.generated_text;
            // sometimes nested under output or content
            if (typeof first.output === 'string') return first.output;
            if (typeof first.output?.text === 'string') return first.output.text;
          }
        }

        // 2) data is an object with text/answer/response
        if (obj.data && typeof obj.data === 'object') {
          if (typeof obj.data.text === 'string' && obj.data.text.trim()) return obj.data.text;
          if (typeof obj.data.answer === 'string' && obj.data.answer.trim()) return obj.data.answer;
          if (typeof obj.data.response === 'string' && obj.data.response.trim()) return obj.data.response;
          if (typeof obj.data.generated_text === 'string' && obj.data.generated_text.trim()) return obj.data.generated_text;
          if (typeof obj.data.output === 'string') return obj.data.output;
          if (typeof obj.data.output?.text === 'string') return obj.data.output.text;
        }

        // 3) top-level text/answer/response/generated_text
        if (typeof obj.text === 'string') return obj.text;
        if (typeof obj.answer === 'string') return obj.answer;
        if (typeof obj.response === 'string') return obj.response;
        if (typeof obj.generated_text === 'string') return obj.generated_text;

        // 4) data is a string
        if (typeof obj.data === 'string') return obj.data;

        // 5) not found
        return '';
      };

      const botText = extractText(json).trim();

      // replace loading placeholder with bot content
      setMessages((m) => m.map((msg) => (msg.id === loadingId ? { ...msg, role: 'bot', text: botText } : msg)));
      setValue('');
      onSend?.(text);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (err) {
      console.warn('Send to endpoint failed', err);
      setMessages((m) => m.map((msg) => (msg.id === loadingId ? { ...msg, role: 'bot', text: 'Fehler beim Laden' } : msg)));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9F9FB', justifyContent: 'center', alignItems: 'center' }}>
      {/* Large centered title (SVG gradient for wide compatibility) - hidden once chat is started */}
      {messages.length === 0 && (
        <View style={{ alignItems: 'center', marginLeft: -50, marginBottom: 40, width: '90%' }}>
        <Svg width="100%" height={48}>
          <Defs>
            <SvgLinearGradient id="chat-title-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#B93F4B" />
              <Stop offset="100%" stopColor="#451268" />
            </SvgLinearGradient>
          </Defs>
          <SvgText
            fill="url(#chat-title-grad)"
            fontSize="34"
            fontWeight="600"
            x="50%"
            y="36"
            textAnchor="middle"
          >
            {`What can I do for you?, ${userName}?`}
          </SvgText>
        </Svg>
      </View>
      )}

      {/* Messages area (chat timeline) */}
      <View style={{ width: '100%', maxWidth: 1500, paddingRight: 20, paddingLeft: 20, marginBottom: 10, minHeight: 10, maxHeight: '80%', alignSelf: 'stretch' }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1, paddingBottom: 24 }} style={{ flex: 1, width: '100%' }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '80%', marginBottom: 6 }}>
                  {/* Use a gradient for user messages as well (right side) */}
                  <LinearGradient
                    colors={["#B93F4B", "#451268"]}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ borderRadius: 12, padding: 1.5, alignSelf: 'flex-end' }}
                  >
                    <View style={{ backgroundColor: 'transparent', borderRadius: 10.5, padding: 12, borderBottomRightRadius: 0 }}>
                      <Text style={{ color: 'white', fontSize: 14 }}>{m.text}</Text>
                    </View>
                  </LinearGradient>
                </View>
              );
            }

            return (
              <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '80%', marginBottom: 6 }}>
                {m.role === 'loading' ? (
                  <View style={{ padding: 12 }}>
                    <ActivityIndicator color="#B93F4B" />
                  </View>
                ) : (
                  <LinearGradient colors={["#B93F4B", "#451268"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, padding: 1.5 }}>
                    <View style={{ backgroundColor: 'white', borderRadius: 10.5, padding: 12 }}>
                      <Text style={{ color: '#111827', fontSize: 14 }}>{m.text}</Text>
                    </View>
                  </LinearGradient>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Pill input bar centered horizontally */}
      <View style={{ width: '85%', maxWidth: 1100 }}>
        <LinearGradient colors={["#B93F4B", "#451268"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 40, padding: 1.5 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 40, paddingVertical: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 6 }}>
            <View style={{ flex: 1 }}>
            <View style={{ position: 'relative' }}>
              {/* Show larger SVG gradient placeholder overlay when empty */}
              {(!value || value.trim().length === 0) && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, top: 6, height: 28, zIndex: 10, elevation: 10 }}>
                  <Svg width="100%" height={28}>
                    <Defs>
                      <SvgLinearGradient id="spark-chat-placeholder-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#B93F4B" />
                        <Stop offset="100%" stopColor="#451268" />
                      </SvgLinearGradient>
                    </Defs>
                    <SvgText fill="url(#spark-chat-placeholder-grad)" fontSize={18} fontWeight="400" x="0" y={20} textAnchor="start">
                      {placeholder}
                    </SvgText>
                  </Svg>
                </View>
              )}

              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10.5, overflow: 'hidden', borderWidth: 0 }}>
                  <TextInput
                  value={value}
                  onChangeText={setValue}
                  placeholder={""}
                  multiline={false}
                  numberOfLines={1}
                  textAlignVertical="center"
                  returnKeyType="send"
                  blurOnSubmit
                  onSubmitEditing={() => sendToEndpoint(value)}
                  style={{
                    width: '100%',
                    minHeight: 36,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    fontSize: 16,
                    color: '#111827',
                    backgroundColor: '#FFFFFF',
                  }}
                />
              </View>
            </View>
            {/* Right-side area: sending indicator */}
            {/* Right-side area intentionally left minimal — loading is shown in the messages timeline, not the input */}
            <View style={{ width: 8 }} />
          </View>
        </View>
        </LinearGradient>
      </View>
    </View>
  );
};

export default SparkChatHome;
