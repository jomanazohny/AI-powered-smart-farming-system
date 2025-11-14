import React, { useState, useCallback } from 'react';
import { 
    SafeAreaView, 
    StyleSheet, 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    ScrollView, 
    ActivityIndicator,
    Platform, 
    Alert, 
    Linking 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker'; 
import * as FileSystem from 'expo-file-system/legacy';

import { FontAwesome, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'; 

const API_KEY = "AIzaSyAVdKFVZhGqJvxW_4B7koH8Ahi2yY06yGQ"; 
const ADVISOR_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY;
const DIAGNOSIS_SERVER_URL = "http://192.168.1.110:5000/diagnose";
interface Source {
    uri: string;
    title: string;
}

interface AdviceState {
    text: string;
    sources: Source[];
    isLoading: boolean;
    error: string | null;
}

type Screen = 'advisor' | 'diagnosis' | 'market' | 'chat';


const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 5): Promise<Response> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorDetail = await response.text();
                console.error(`Attempt ${attempt + 1} failed with status ${response.status}: ${errorDetail}`);
                throw new Error(`HTTP error! Status: ${response.status}. Detail: ${errorDetail.substring(0, 100)}...`);
            }
            return response;
        } catch (error: any) {
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay / 1000}s...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error("API request failed after multiple retries: " + error.message);
            }
        }
    }
    throw new Error("Exhausted all retry attempts."); 
};

const renderMarkdown = (markdownText: string | null): React.ReactNode => {
    if (!markdownText) return <Text style={styles.adviceText} />;

    const elements: React.ReactNode[] = [];
    const lines = markdownText.split('\n');

    lines.forEach((line, index) => {
        let content = line.trim();

        if (content.startsWith('## ')) {
            elements.push(<Text key={index} style={styles.h2}>{content.substring(3).trim()}</Text>);
            return;
        }

        if (content.startsWith('* ') || content.startsWith('- ')) {
            elements.push(<Text key={index} style={styles.listItem}>• {content.substring(2).trim()}</Text>);
            return;
        }

        if (content.length > 0) {
            const parts: React.ReactNode[] = [];
            let remainingText = content;
            let key = 0;

            const boldRegex = /\*\*(.*?)\*\*/g;
            let match;
            let lastIndex = 0;

            while ((match = boldRegex.exec(remainingText)) !== null) {
                if (match.index > lastIndex) {
                    parts.push(<Text key={key++} style={styles.adviceText}>{remainingText.substring(lastIndex, match.index)}</Text>);
                }
                parts.push(<Text key={key++} style={styles.adviceTextBold}>{match[1]}</Text>);
                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < remainingText.length) {
                parts.push(<Text key={key++} style={styles.adviceText}>{remainingText.substring(lastIndex)}</Text>);
            }

            elements.push(<View key={index} style={styles.paragraph}>{parts}</View>);
        }
    });

    return <View>{elements}</View>;
};


const AdvisorScreen: React.FC<{
    adviceState: AdviceState;
    crop: string;
    setCrop: (c: string) => void;
    landSize: string;
    setLandSize: (l: string) => void;
    soilType: string;
    setSoilType: (s: string) => void;
    getFarmingAdvice: () => Promise<void>;
    resetForm: () => void;
}> = ({
    adviceState, crop, setCrop, landSize, setLandSize, soilType, setSoilType,
    getFarmingAdvice, resetForm
}) => {

    const { text, isLoading, sources, error } = adviceState;

    const handleSourcePress = (uri: string) => {
        Linking.openURL(uri).catch(() => Alert.alert("فشل فتح الرابط", `تعذر فتح الرابط: ${uri}`, [{ text: "حسناً" }]));
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Advisor header */}
            <View style={styles.card}>
                <Text style={styles.cardHeader}>📊 استشارات زراعية</Text>
                <Text style={styles.subtitle}>أدخل بيانات مزرعتك للحصول على أفضل التوصيات.</Text>
            </View>

            {/* Main Input Card */}
            <View style={[styles.card, styles.inputCard]}>
                
                {/* Error Message Display */}
                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorTextBold}>{error.split(':')[0]}:</Text>
                        <Text style={styles.errorText}>{error.split(':')[1]}</Text>
                    </View>
                )}
                
                {/* Crop Input */}
                <Text style={styles.inputLabel}>المحصول المستهدف</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="مثل: قمح، طماطم، ذرة"
                    placeholderTextColor="#9ca3af"
                    value={crop}
                    onChangeText={setCrop}
                    keyboardAppearance='default'
                />

                {/* Land Size Input */}
                <Text style={styles.inputLabel}>حجم الأرض</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="مثال: 5 فدان، 20 هكتار"
                    placeholderTextColor="#9ca3af"
                    value={landSize}
                    onChangeText={setLandSize}
                    keyboardType='default'
                />

                {/* Soil Type Input */}
                <Text style={styles.inputLabel}>نوع التربة</Text>
                <TextInput
                    style={styles.textInput}
                    placeholder="مثال: طينية، رملية، صفراء"
                    placeholderTextColor="#9ca3af"
                    value={soilType}
                    onChangeText={setSoilType}
                    keyboardAppearance='default'
                />

                {/* Button Group */}
                <View style={styles.buttonGroup}>
                    {/* Get Advice Button */}
                    <TouchableOpacity
                        style={[styles.buttonPrimary, isLoading && styles.buttonDisabled, {flex: 1}]}
                        onPress={getFarmingAdvice}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>احصل على التقرير</Text>
                        )}
                    </TouchableOpacity>

                    {/* Clear Button */}
                    <TouchableOpacity
                        style={[styles.buttonSecondary, isLoading && styles.buttonDisabled, {width: 100}]}
                        onPress={resetForm}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonTextSecondary}>مسح</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Advice Output Section */}
            {text.length > 0 && (
                <View style={[styles.card, styles.reportCard]}>
                    <Text style={styles.reportHeader}>تقرير المستشار الزراعي</Text>
                    
                    <View style={styles.adviceContent}>
                        {renderMarkdown(text)}
                    </View>
                
                    {sources.length > 0 && (
                        <View style={styles.sourcesContainer}>
                            <Text style={styles.sourcesHeader}>المصادر المستخدمة:</Text>
                            {sources.map((source, index) => (
                                <Text 
                                    key={index} 
                                    style={styles.sourceItem} 
                                    onPress={() => handleSourcePress(source.uri)}
                                >
                                    • {source.title}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>
            )}
            <View style={{height: 50}} /> 
        </ScrollView>
    );
};

const DiagnosisScreen: React.FC = () => {
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [diagnosis, setDiagnosis] = useState('');
    const [cropType, setCropType] = useState('potato'); 

    const diagnoseImage = useCallback(async (localUri: string) => {
        setIsLoading(true);
        setDiagnosis('');

        try {
           const base64Image = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64', 
});

            const response = await fetch(DIAGNOSIS_SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: base64Image, crop_type: cropType }), 
            });

            if (!response.ok) {
                const errorDetail = await response.text();
                throw new Error(`Server Error: ${response.status}. Detail: ${errorDetail}`);
            }

            const result = await response.json();
            
            const diagnosisText = `**المرض:** ${result.disease || 'غير معروف'}\n\n**العلاج المقترح:**\n${result.treatment || 'لا يوجد علاج مقترح.'}`;
            
            setDiagnosis(diagnosisText);

        } catch (e: any) {
            console.error("Diagnosis failed:", e);
            Alert.alert("خطأ في التشخيص", `فشل الاتصال بالخادم. التفاصيل: ${e.message}`, [{ text: "حسناً" }]);
        } finally {
            setIsLoading(false);
        }
    }, [cropType]);


    const handleImagePickAndDiagnose = useCallback(async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permissionResult.granted === false) {
            Alert.alert("الإذن مطلوب", "يجب تفعيل إذن الوصول إلى معرض الصور للتشخيص.", [{ text: "حسناً" }]);
            return;
        }

        let pickerResult = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
            const uri = pickerResult.assets[0].uri;
            setImageUri(uri);
            await diagnoseImage(uri);
        }
    }, [diagnoseImage]);


    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.card}>
                <Text style={styles.cardHeader}>📸 تشخيص أمراض المحاصيل</Text>
                <Text style={styles.subtitle}>التقط صورة لورقة نبات مصابة لتحديد المرض والحصول على علاج.</Text>
            </View>

            <View style={[styles.card, { alignItems: 'center', padding: 20 }]}>
                
                {/* Crop Type Selection */}
                <Text style={styles.inputLabel}>اختر المحصول:</Text>
                <View style={styles.cropSelector}>
                    {['potato', 'mango', 'wheat'].map((crop) => ( 
                        <TouchableOpacity
                            key={crop}
                            style={[styles.cropButton, cropType === crop && styles.cropButtonActive]}
                            onPress={() => setCropType(crop)}
                            disabled={isLoading}
                        >
                            <Text style={[styles.cropText, cropType === crop && styles.cropTextActive]}>
                                {crop === 'potato' ? 'البطاطس' : (crop === 'mango' ? 'المانجو' : 'القمح')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>


                {/* Image Placeholder/Picker */}
                <TouchableOpacity 
                    style={styles.imagePlaceholder} 
                    onPress={handleImagePickAndDiagnose}
                    disabled={isLoading}
                >
                    <MaterialCommunityIcons 
                        name={imageUri ? "check-circle" : "camera-iris"} 
                        size={80} 
                        color={imageUri ? "#2e7d32" : "#388e3c"} 
                    />
                    <Text style={styles.imagePlaceholderText}>
                        {imageUri ? 'الصورة جاهزة' : 'اضغط للالتقاط/الاختيار'}
                    </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                    style={[styles.buttonPrimary, {marginTop: 20, width: '100%'}, isLoading && styles.buttonDisabled]}
                    onPress={handleImagePickAndDiagnose}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>تشخيص المرض</Text>
                    )}
                </TouchableOpacity>

                {diagnosis.length > 0 && (
                     <View style={[styles.reportCard, {marginTop: 20, width: '100%'}]}>
                         <Text style={styles.reportHeader}>النتائج</Text>
                         {renderMarkdown(diagnosis)}
                     </View>
                )}
            </View>
            <View style={{height: 50}} /> 
        </ScrollView>
    );
};

const MarketScreen: React.FC = () => {
    const [chatInput, setChatInput] = useState('');

    const handleSendChat = () => {
        if (!chatInput.trim()) return;
        Alert.alert(
            "خدمة الشات الصوتي",
            `الرسالة: "${chatInput}" \n\n تتطلب هذه الميزة التكامل مع **نظام محادثة ذكي** لتوفير تجربة التفاعل الصوتي والكتابي باللغة العربية.`,
            [{ text: "حسناً" }]
        );
        setChatInput('');
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.card}>
                <Text style={styles.cardHeader}>💰 إدارة الموارد والسوق</Text>
                <Text style={styles.subtitle}>احصل على معلومات السوق، نصائح الري، واستخدم الشات الآلي.</Text>
            </View>

            {/* Feature Cards */}
            <View style={styles.featureGrid}>
                {/* Irrigation Advice */}
                <TouchableOpacity style={styles.featureCard} onPress={() => Alert.alert("الري الذكي", "توصية ذكية بكمية ووقت الري بناءً على المحصول والموقع، بهدف توفير المياه.", [{ text: "حسناً" }])}>
                    <MaterialCommunityIcons name="water-sync" size={32} color="#15803d" />
                    <Text style={styles.featureText}>الري الذكي</Text>
                </TouchableOpacity>
                {/* Market Insights */}
                <TouchableOpacity style={styles.featureCard} onPress={() => Alert.alert("تحليل السوق", "تحليل أسعار المحاصيل وتوقعات السوق لزيادة الأرباح واتخاذ القرارات البيعية الصحيحة.", [{ text: "حسناً" }])}>
                    <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={32} color="#15803d" />
                    <Text style={styles.featureText}>تحليل السوق</Text>
                </TouchableOpacity>
            </View>

            {/* Arabic Chatbot */}
            <View style={[styles.card, { marginTop: 20 }]}>
                <View style={styles.chatHeader}>
                    <FontAwesome name="microphone" size={20} color="#388e3c" />
                    <Text style={styles.chatTitle}>مساعد الدردشة باللغة العربية</Text>
                </View>
                
                {/* Chat Display Placeholder */}
                <View style={styles.chatWindow}>
                    <Text style={{textAlign: 'right', color: '#666'}}>مرحباً، كيف يمكنني مساعدتك في مزرعتك؟</Text>
                </View>

                {/* Chat Input */}
                <View style={styles.chatInputContainer}>
                    <TextInput
                        style={styles.chatTextInput}
                        placeholder="اكتب سؤالك أو اضغط على الميكروفون للتحدث..."
                        placeholderTextColor="#9ca3af"
                        value={chatInput}
                        onChangeText={setChatInput}
                        textAlign='right'
                        keyboardAppearance='default'
                    />
                    <TouchableOpacity style={styles.chatSendButton} onPress={handleSendChat}>
                        <MaterialIcons name="send" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={{height: 50}} /> 
        </ScrollView>
    );
};


const App: React.FC = () => {
    const [currentScreen, setCurrentScreen] = useState<Screen>('advisor');
    
    const [crop, setCrop] = useState('قمح');
    const [landSize, setLandSize] = useState('5 فدان');
    const [soilType, setSoilType] = useState('تربة طينية');
    const [adviceState, setAdviceState] = useState<AdviceState>({
        text: '',
        sources: [],
        isLoading: false,
        error: null,
    });
    
    const displayError = (title: string, message: string) => {
        setAdviceState(prev => ({ ...prev, error: `${title}: ${message}` }));
        setTimeout(() => setAdviceState(prev => ({ ...prev, error: null })), 5000);
    };

    const resetForm = useCallback(() => {
        setCrop('');
        setLandSize('');
        setSoilType('');
        setAdviceState({ text: '', sources: [], isLoading: false, error: null });
    }, []);

    const getFarmingAdvice = useCallback(async () => {
        if (!crop || !landSize || !soilType) {
            displayError('معلومات ناقصة', 'يرجى ملء جميع الحقول المطلوبة (المحصول، الحجم، نوع التربة).');
            return;
        }

        setAdviceState(prev => ({ ...prev, isLoading: true, text: '', sources: [], error: null }));

        const systemPrompt = `أنت مستشار زراعي ذكي ومتخصص ومصمم خصيصاً للمزارعين أصحاب الحيازات الصغيرة في مصر. قدم نصيحة موجزة وقابلة للتنفيذ وسليمة علمياً للبارامترات المعطاة، مع التركيز على طرق حفظ المياه ذات الصلة بالمناخ والتربة المصرية. استجب بشكل أساسي باللغة العربية الواضحة والاحترافية.`;
        const userQuery = `قدم نصيحة زراعية مفصلة بناءً على المعطيات التالية:\nالمحصول: ${crop}\nحجم الأرض: ${landSize}\nنوع التربة: ${soilType}`;

        try {
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                tools: [{ "google_search": {} }], 
                systemInstruction: { parts: [{ text: systemPrompt }] },
            };

            const response = await fetchWithRetry(ADVISOR_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                
                let extractedSources: Source[] = [];
                const groundingMetadata = candidate.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    extractedSources = groundingMetadata.groundingAttributions
                        .map(attribution => ({ uri: attribution.web?.uri || '', title: attribution.web?.title || 'مصدر غير معروف' }))
                        .filter(source => source.uri && source.title)
                        .slice(0, 3);
                }
                setAdviceState({ text, sources: extractedSources, isLoading: false, error: null });
            } else {
                const errorReason = result.promptFeedback?.blockReason || 'سبب غير معروف';
                displayError('حظر المستشار', `تعذر استرداد النصيحة. السبب: ${errorReason}.`);
                setAdviceState(prev => ({ ...prev, isLoading: false, text: '' }));
            }
        } catch (e: any) {
            console.error('Error fetching advice:', e);
            displayError('خطأ في الاتصال', `فشل الاتصال. التفاصيل: ${e.message}`);
            setAdviceState(prev => ({ ...prev, isLoading: false, text: '' }));
        }
    }, [crop, landSize, soilType]);

    const renderContent = () => {
        switch (currentScreen) {
            case 'advisor':
                return (
                    <AdvisorScreen 
                        adviceState={adviceState}
                        crop={crop} setCrop={setCrop}
                        landSize={landSize} setLandSize={setLandSize}
                        soilType={soilType} setSoilType={setSoilType}
                        getFarmingAdvice={getFarmingAdvice}
                        resetForm={resetForm}
                    />
                );
            case 'diagnosis':
                return <DiagnosisScreen />;
            case 'market':
                return <MarketScreen />;
            default:
                return (
                    <AdvisorScreen 
                        adviceState={adviceState}
                        crop={crop} setCrop={setCrop}
                        landSize={landSize} setLandSize={setLandSize}
                        soilType={soilType} setSoilType={setSoilType}
                        getFarmingAdvice={getFarmingAdvice}
                        resetForm={resetForm}
                    />
                );
        }
    };

    const NavItem: React.FC<{ 
        screen: Screen, 
        icon: keyof typeof FontAwesome.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap | keyof typeof MaterialIcons.glyphMap, 
        label: string, 
        IconComponent: any 
    }> = ({ screen, icon, label, IconComponent }) => (
        <TouchableOpacity
            style={styles.navItem}
            onPress={() => setCurrentScreen(screen)}
        >
            <IconComponent 
                name={icon} 
                size={24} 
                color={currentScreen === screen ? '#388e3c' : '#9ca3af'} 
            />
            <Text style={[styles.navText, currentScreen === screen && styles.navTextActive]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>🌾 مستشار الزراعة الذكي لمصر</Text>
            </View>
            
            <View style={styles.content}>
                {renderContent()}
            </View>

            <View style={styles.bottomNav}>
                <NavItem screen="market" icon="currency-usd" label="السوق والموارد" IconComponent={MaterialCommunityIcons} />
                <NavItem screen="diagnosis" icon="leaf" label="تشخيص الأمراض" IconComponent={MaterialCommunityIcons} />
                <NavItem screen="advisor" icon="home" label="استشارات عامة" IconComponent={FontAwesome} />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#e8f5e9',
    },
    header: {
        backgroundColor: '#388e3c',
        padding: 16,
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
            },
            android: {
                elevation: 5,
            },
        }),
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    content: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: 16,
    },
    contentContainer: {
        paddingVertical: 16,
        alignItems: 'stretch',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
    },
    inputCard: {
        borderTopWidth: 4,
        borderTopColor: '#4caf50',
    },
    cardHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#388e3c',
        marginBottom: 4,
        textAlign: 'right',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
        textAlign: 'right',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginTop: 12,
        marginBottom: 4,
        textAlign: 'right',
    },
    textInput: {
        height: 48,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        fontSize: 16,
        color: '#333',
        textAlign: 'right',
        backgroundColor: '#f9f9f9',
    },
    buttonGroup: {
        flexDirection: 'row',
        marginTop: 20,
        justifyContent: 'space-between',
    },
    buttonPrimary: {
        backgroundColor: '#4caf50',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#4caf50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    buttonSecondary: {
        backgroundColor: '#e0e0e0',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
    },
    buttonDisabled: {
        backgroundColor: '#a5d6a7',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonTextSecondary: {
        color: '#555',
        fontSize: 16,
        fontWeight: 'bold',
    },

    errorBox: {
        backgroundColor: '#ffebee',
        borderColor: '#e57373',
        borderWidth: 1,
        padding: 12,
        borderRadius: 8,
        marginBottom: 15,
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
    },
    errorTextBold: {
        color: '#c62828',
        fontWeight: 'bold',
        fontSize: 14,
        marginRight: 5,
    },
    errorText: {
        color: '#c62828',
        fontSize: 14,
        flexShrink: 1,
        textAlign: 'right',
    },

    reportCard: {
        borderLeftWidth: 8,
        borderLeftColor: '#388e3c',
        backgroundColor: '#f0fff0',
        padding: 20,
    },
    reportHeader: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#388e3c',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        paddingBottom: 8,
        marginBottom: 10,
        textAlign: 'right',
    },
    adviceContent: {
    },
    adviceText: {
        fontSize: 15,
        color: '#333',
        lineHeight: 24,
        textAlign: 'right',
    },
    adviceTextBold: {
        fontWeight: 'bold',
        color: '#1b5e20',
        fontSize: 15,
    },
    h2: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#1b5e20',
        marginTop: 15,
        marginBottom: 5,
        textAlign: 'right',
    },
    listItem: {
        fontSize: 15,
        color: '#333',
        lineHeight: 24,
        paddingRight: 15,
        textAlign: 'right',
    },
    paragraph: {
        marginBottom: 10,
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
    },
    sourcesContainer: {
        marginTop: 15,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    sourcesHeader: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
        marginBottom: 5,
        textAlign: 'right',
    },
    sourceItem: {
        fontSize: 12,
        color: '#1e88e5',
        textDecorationLine: 'underline',
        marginBottom: 2,
        textAlign: 'right',
    },

    cropSelector: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-around',
        width: '100%',
        marginBottom: 20,
    },
    cropButton: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        backgroundColor: '#f1f8e9',
        borderWidth: 1,
        borderColor: '#a5d6a7',
    },
    cropButtonActive: {
        backgroundColor: '#388e3c',
        borderColor: '#1b5e20',
    },
    cropText: {
        color: '#388e3c',
        fontWeight: '600',
    },
    cropTextActive: {
        color: '#fff',
    },
    imagePlaceholder: {
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: '#f0fff0',
        borderColor: '#a5d6a7',
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    imagePlaceholderText: {
        marginTop: 5,
        color: '#388e3c',
        fontSize: 12,
    },

    featureGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    featureCard: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        width: '48%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
        borderBottomWidth: 3,
        borderBottomColor: '#4caf50',
    },
    featureText: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: 'bold',
        color: '#388e3c',
        textAlign: 'center',
    },
    
    chatHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 10,
    },
    chatTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginRight: 8,
    },
    chatWindow: {
        height: 150,
        backgroundColor: '#f0f4f7',
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        overflow: 'hidden',
    },
    chatInputContainer: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    chatTextInput: {
        flex: 1,
        height: 50,
        backgroundColor: '#fff',
        borderRadius: 25,
        paddingHorizontal: 15,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        fontSize: 15,
    },
    chatSendButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#4caf50',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#4caf50',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 5,
    },

    bottomNav: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        ...Platform.select({
            ios: {
                paddingBottom: 30,
            },
        }),
    },
    navItem: {
        alignItems: 'center',
        padding: 5,
    },
    navText: {
        fontSize: 11,
        color: '#9ca3af',
        marginTop: 4,
        fontWeight: '500',
        textAlign: 'center',
    },
    navTextActive: {
        color: '#388e3c',
        fontWeight: 'bold',
    },
});

export default App;