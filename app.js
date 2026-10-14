const input = document.querySelector('#questionInput');
const conversation = document.querySelector('#conversation');
const welcome = document.querySelector('#welcome');
const micButton = document.querySelector('#micButton');
const toast = document.querySelector('#toast');
let toastTimer;
const languageStorageKey = 'swar_ai_language_v1';
let currentLanguage = (() => {
  try {
    const saved = localStorage.getItem(languageStorageKey);
    return saved && ['mr', 'hi', 'en'].includes(saved) ? saved : 'mr';
  } catch {
    return 'mr';
  }
})();
const voiceModal = document.querySelector('#voiceModal');
const voiceStart = document.querySelector('#voiceStart');
const voiceStatus = document.querySelector('#voiceStatus');
const voiceCard = document.querySelector('.voice-card');
const voiceTranscript = document.querySelector('#voiceTranscript');
const voiceModel = 'gemini-2.5-flash-native-audio-preview-12-2025';
let voiceRecognition;
let voiceRecorder;
let voiceRecorderStream;
let voiceRecorderTimer;
let voiceSilenceCheckTimer;
let voiceAudioContext;
let voiceAnalyser;
let voiceRecordingStartedAt = 0;
let voiceSpeechStartedAt = 0;
let voiceLastSoundAt = 0;
let voiceModeActive = false;
let voiceModeWaiting = false;
let voiceModeSpeaking = false;
let voiceModeSession = 0;
let voiceFallbackNoticeShown = false;
let activeAudio;
let activeAudioCleanup;
let activeLiveAudioPlayer;
let activeVoiceSpeechController;
const chatStorageKey = 'swar_ai_chat_history_v1';
let savedChats = loadSavedChats();
let activeChatId = null;
let restoringChat = false;

const voiceCopy = {
  mr: { title: 'बोलून विचारा', prompt: 'प्रश्न विचारण्यासाठी खालील माइकवर क्लिक करा.', button: 'माइकवर क्लिक करून विचारा', stopButton: 'आवाज संभाषण थांबवा', starting: 'माइक सुरू होत आहे', recording: 'ऐकत आहे', hint: 'मराठी, हिन्दी किंवा English मध्ये बोला', listening: 'ऐकत आहे… आता तुमचा प्रश्न बोला.', thinking: 'तुमचे म्हणणे समजून घेत आहे…', speaking: 'स्वर एआय उत्तर देत आहे…', ready: 'तुम्ही बोलणे पूर्ण केल्यावर उत्तर चॅटमध्ये दिसेल आणि ऐकू येईल.', stopped: 'आवाज संभाषण थांबवले.', unsupported: 'या ब्राउझरमध्ये माइक रेकॉर्डिंग उपलब्ध नाही. Chrome किंवा Edge मध्ये स्वर एआय उघडा.', denied: 'मायक्रोफोनची परवानगी द्या आणि पुन्हा प्रयत्न करा.', transcriptionFailed: 'आवाज समजला नाही. पुन्हा माइकवर क्लिक करून प्रयत्न करा.' },
  hi: { title: 'बोलकर पूछें', prompt: 'सवाल पूछने के लिए नीचे दिए माइक पर क्लिक करें।', button: 'माइक पर क्लिक करके पूछें', stopButton: 'आवाज़ में बातचीत रोकें', starting: 'माइक शुरू हो रहा है', recording: 'सुन रहा हूँ', hint: 'मराठी, हिन्दी या English में बोलें', listening: 'सुन रहा हूँ… अब अपना सवाल बोलें।', thinking: 'आपकी बात समझ रहा हूँ…', speaking: 'स्वर एआई जवाब दे रहा है…', ready: 'आपकी बात चैट में दिखेगी और जवाब आवाज़ में सुनाई देगा।', stopped: 'आवाज़ में बातचीत रुक गई।', unsupported: 'इस ब्राउज़र में माइक रिकॉर्डिंग उपलब्ध नहीं है। स्वर एआई को Chrome या Edge में खोलें।', denied: 'माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें.', transcriptionFailed: 'आवाज़ समझ नहीं आई। माइक दबाकर फिर कोशिश करें।' },
  en: { title: 'Ask by voice', prompt: 'Click the microphone below to ask your question.', button: 'Click the microphone to ask', stopButton: 'Stop voice conversation', starting: 'Starting microphone…', recording: 'Listening', hint: 'Speak in Marathi, Hindi, or English', listening: 'Listening… Go ahead and ask your question.', thinking: 'I’m understanding your question…', speaking: 'SWAR_AI is speaking…', ready: 'Your question will appear in chat, and the answer will be spoken aloud.', stopped: 'Voice conversation paused.', unsupported: 'Microphone recording is unavailable here. Open SWAR_AI in Chrome or Edge.', denied: 'Allow microphone access, then try again.', transcriptionFailed: 'I could not understand that recording. Tap the microphone and try again.' }
};

const copy = {
  mr: {
    brand: 'स्वर एआय', brandFirst: 'स्वर', brandSuffix: '_एआय', tagline: 'सेवा तुमच्या भाषेत', assistantLabel: 'सहाय्यक', sidebarOpen: 'साइडबार उघडा', sidebarClose: 'साइडबार बंद करा',
    langName: 'मराठी', navHome: 'मुख्यपृष्ठ', navServices: 'सरकारी सेवा', navHow: 'कसे वापरावे?', newChat: 'नवीन प्रश्न विचारा', sideLabel: 'तुमच्यासाठी',
    helpLine1: 'योग्य माहिती,', helpLine2: 'योग्य स्रोतांसह.', helpNote: 'प्रत्येक उत्तरासोबत स्रोत दुवे.', hello: 'नमस्कार!', languageLabel: 'तुमची भाषा: मराठी',
    assistant: 'तुमचा डिजिटल सेवा साथी', headingA: 'सरकारी सेवा,', headingB: 'आता सोप्या मराठीत.', welcome: 'नमस्कार! तुम्हाला कोणत्या सरकारी सेवेबद्दल माहिती हवी आहे?', welcome2: 'बोला किंवा खाली तुमचा प्रश्न लिहा.',
    chip1: 'उत्पन्नाचा दाखला', chip2: 'रेशन कार्ड', chip3: 'सरकारी योजना', placeholder: 'तुमचा प्रश्न मराठीत लिहा...', enter: 'पाठवण्यासाठी Enter दाबा', note: 'स्वर एआय माहिती समजून घेण्यासाठी मदत करतो. अंतिम माहितीसाठी अधिकृत स्रोत तपासा.',
    privacy: 'तुमची माहिती सुरक्षित', history: 'मागील चॅट', historyNote: 'चॅट फक्त या ब्राउझरमध्ये जतन होतात.', deleteChat: 'चॅट हटवा', emptyHistory: 'अजून चॅट नाहीत', source: 'स्रोत', listen: 'ऐकून घ्या', translate: 'भाषांतर', translating: 'भाषांतर होत आहे...', original: 'मूळ मजकूर', you: 'तुम्ही', unsupported: 'या नमुना आवृत्तीत सध्या मराठी उपलब्ध आहे.',
    prompts: ['उत्पन्नाचा दाखला कसा काढायचा?', 'रेशन कार्डसाठी कोणती कागदपत्रे लागतात?', 'शासकीय योजनांची माहिती कुठे मिळेल?']
  },
  hi: {
    brand: 'स्वर एआई', brandFirst: 'स्वर', brandSuffix: '_एआई', tagline: 'आपकी भाषा में सेवाएँ', assistantLabel: 'सहायक', sidebarOpen: 'साइडबार खोलें', sidebarClose: 'साइडबार बंद करें',
    langName: 'हिन्दी', navHome: 'मुखपृष्ठ', navServices: 'सरकारी सेवाएँ', navHow: 'कैसे इस्तेमाल करें?', newChat: 'नया सवाल पूछें', sideLabel: 'आपके लिए',
    helpLine1: 'सही जानकारी,', helpLine2: 'सही स्रोतों के साथ।', helpNote: 'हर जवाब के साथ स्रोत लिंक।', hello: 'नमस्कार!', languageLabel: 'आपकी भाषा: हिन्दी',
    assistant: 'आपका डिजिटल सेवा साथी', headingA: 'सरकारी सेवाएँ,', headingB: 'अब आसान भाषा में।', welcome: 'नमस्कार! आपको किस सरकारी सेवा के बारे में जानकारी चाहिए?', welcome2: 'बोलें या नीचे अपना सवाल लिखें।',
    chip1: 'आय प्रमाणपत्र', chip2: 'राशन कार्ड', chip3: 'सरकारी योजनाएँ', placeholder: 'अपना सवाल हिन्दी में लिखें...', enter: 'भेजने के लिए Enter दबाएँ', note: 'स्वर एआई जानकारी समझने में मदद करता है। अंतिम जानकारी के लिए आधिकारिक स्रोत देखें।',
    privacy: 'आपकी जानकारी सुरक्षित है', history: 'पुरानी चैट', historyNote: 'चैट केवल इसी ब्राउज़र में सहेजी जाती हैं।', deleteChat: 'चैट हटाएँ', emptyHistory: 'अभी कोई चैट नहीं है', source: 'स्रोत', listen: 'सुनें', translate: 'अनुवाद करें', translating: 'अनुवाद हो रहा है...', original: 'मूल जवाब', you: 'आप', unsupported: 'इस नमूना संस्करण में यह सुविधा उपलब्ध नहीं है.',
    prompts: ['आय प्रमाणपत्र कैसे बनवाएँ?', 'राशन कार्ड के लिए कौन से दस्तावेज़ चाहिए?', 'सरकारी योजनाओं की जानकारी कहाँ मिलेगी?']
  },
  en: {
    brand: 'SWAR_AI', brandFirst: 'SWAR', brandSuffix: '_AI', tagline: 'Services in your language', assistantLabel: 'Assistant', sidebarOpen: 'Open sidebar', sidebarClose: 'Close sidebar',
    langName: 'English', navHome: 'Home', navServices: 'Government services', navHow: 'How to use', newChat: 'Ask a new question', sideLabel: 'For you',
    helpLine1: 'Clear information,', helpLine2: 'with trusted sources.', helpNote: 'Source links appear with answers.', hello: 'Welcome!', languageLabel: 'Your language: English',
    assistant: 'Your digital service companion', headingA: 'Government services,', headingB: 'made easier to understand.', welcome: 'Hello! What government service would you like help with?', welcome2: 'Speak or type your question below.',
    chip1: 'Income certificate', chip2: 'Ration card', chip3: 'Government schemes', placeholder: 'Type your question in English...', enter: 'Press Enter to send', note: 'SWAR_AI helps explain information. Check official sources for final details.',
    privacy: 'Your information is protected', history: 'Recent chats', historyNote: 'Chats are saved only in this browser.', deleteChat: 'Delete chat', emptyHistory: 'No saved chats yet', source: 'Sources', listen: 'Listen', translate: 'Translate', translating: 'Translating...', original: 'Show original', you: 'You', unsupported: 'This feature is not available in this sample version.',
    prompts: ['How do I get an income certificate?', 'What documents are needed for a ration card?', 'Where can I find government schemes?']
  }
};

const answers = [
  {
    match: /उत्पन्न|आय प्रमाणपत्र|income|income certificate/i,
    title: 'उत्पन्नाचा दाखला',
    answer: 'उत्पन्नाच्या दाखल्यासाठी अर्जाची प्रक्रिया आणि कागदपत्रांची यादी जिल्ह्यानुसार बदलू शकते. सुरुवात करण्यासाठी आपल्या जवळच्या सेतू केंद्रात किंवा अधिकृत आपले सरकार पोर्टलवर सेवा तपासा. तिथे चालू अटी आणि आवश्यक कागदपत्रांची यादी पाहूनच अर्ज करा.',
    answerHi: 'आय प्रमाणपत्र के लिए आवेदन की प्रक्रिया और दस्तावेज़ों की सूची ज़िले के अनुसार बदल सकती है। अपने नज़दीकी सेतु केंद्र या आधिकारिक आपले सरकार पोर्टल पर सेवा देखें। आवेदन करने से पहले वहाँ मौजूदा शर्तें और दस्तावेज़ों की सूची जाँच लें।',
    answerEn: 'The application process and document list for an income certificate can vary by district. Check the service at your local Setu centre or on the official Aaple Sarkar portal. Review the current requirements there before applying.',
    source: 'आपले सरकार — महाराष्ट्र शासन', url: 'https://aaplesarkar.mahaonline.gov.in/', date: 'अधिकृत सेवा पोर्टल'
  },
  {
    match: /रेशन|राशन|ration|शिधापत्रिका/i,
    title: 'रेशन कार्ड',
    answer: 'रेशन कार्डसाठी अर्ज आणि कागदपत्रांची अचूक माहिती तुमच्या परिस्थितीनुसार बदलू शकते. महाराष्ट्राच्या अधिकृत अन्न, नागरी पुरवठा विभागाच्या संकेतस्थळावर सध्याची प्रक्रिया तपासा. अर्ज करण्यापूर्वी पोर्टलवरील अद्ययावत सूचना वाचा.',
    answerHi: 'राशन कार्ड के आवेदन और दस्तावेज़ों की सही जानकारी आपकी स्थिति के अनुसार बदल सकती है। महाराष्ट्र के आधिकारिक खाद्य, नागरिक आपूर्ति विभाग की वेबसाइट पर मौजूदा प्रक्रिया देखें। आवेदन से पहले पोर्टल पर दिए गए नए निर्देश पढ़ें।',
    answerEn: 'The application process and exact documents for a ration card may depend on your circumstances. Check the current process on Maharashtra’s official Food, Civil Supplies and Consumer Protection Department website. Read the latest instructions before applying.',
    source: 'अन्न, नागरी पुरवठा व ग्राहक संरक्षण विभाग', url: 'https://mahafood.gov.in/', date: 'महाराष्ट्र शासन'
  },
  {
    match: /योजना|योजनाएँ|योजनाएं|scheme|शिष्यवृत्ती|पेन्शन/i,
    title: 'शासकीय योजना',
    answer: 'योजनेची पात्रता, लाभ आणि अर्जाची पद्धत प्रत्येक योजनेसाठी वेगळी असते. महाराष्ट्र शासनाच्या अधिकृत पोर्टलवर योजना शोधा आणि संबंधित विभागाच्या अटी तपासा. स्वर एआयच्या या नमुना आवृत्तीत सध्या मर्यादित माहिती उपलब्ध आहे; पात्रतेची खात्री अधिकृत विभागाकडूनच करा.',
    answerHi: 'हर योजना की पात्रता, लाभ और आवेदन प्रक्रिया अलग होती है। महाराष्ट्र सरकार के आधिकारिक पोर्टल पर योजना खोजें और संबंधित विभाग की शर्तें देखें। स्वर एआई के इस नमूना संस्करण में सीमित जानकारी है; पात्रता की पुष्टि संबंधित आधिकारिक विभाग से करें।',
    answerEn: 'Eligibility, benefits and application steps differ for each scheme. Search the Maharashtra government’s official portal and check the relevant department’s requirements. This SWAR_AI sample has limited information; confirm eligibility with the official department.',
    source: 'महाराष्ट्र शासन — अधिकृत पोर्टल', url: 'https://www.maharashtra.gov.in/', date: 'अधिकृत सरकारी संकेतस्थळ'
  },
  {
    match: /जात|रहिवास|अधिवास|दाखला|प्रमाणपत्र|certificate/i,
    title: 'प्रमाणपत्र सेवा',
    answer: 'प्रमाणपत्रांची प्रक्रिया आणि आवश्यक कागदपत्रे सेवेनुसार व जिल्ह्यानुसार वेगळी असू शकतात. आपले सरकार पोर्टलवर संबंधित सेवा निवडा; तिथे अर्जाची सद्यस्थिती, कागदपत्रे आणि लागू सूचना मिळतील. येथे दिलेले मार्गदर्शन प्राथमिक आहे.',
    answerHi: 'प्रमाणपत्र की प्रक्रिया और आवश्यक दस्तावेज़ सेवा तथा ज़िले के अनुसार अलग हो सकते हैं। आपले सरकार पोर्टल पर संबंधित सेवा चुनें; वहाँ मौजूदा प्रक्रिया, दस्तावेज़ और निर्देश देखें। यहाँ दी गई जानकारी केवल शुरुआती मार्गदर्शन है।',
    answerEn: 'Certificate procedures and required documents can vary by service and district. Select the relevant service on the Aaple Sarkar portal to see current steps, documents and instructions. This is introductory guidance.',
    source: 'आपले सरकार — महाराष्ट्र शासन', url: 'https://aaplesarkar.mahaonline.gov.in/', date: 'अधिकृत सेवा पोर्टल'
  }
];

function setLanguage(language) {
  if (!copy[language]) language = 'mr';
  currentLanguage = language;
  const t = copy[language];
  document.documentElement.lang = language;
  try { localStorage.setItem(languageStorageKey, language); } catch { /* Keep the current page language if storage is unavailable. */ }
  document.querySelector('#brandTitle').textContent = t.brandFirst;
  document.querySelector('#brandSuffix').textContent = t.brandSuffix;
  document.querySelector('#brandTagline').textContent = t.tagline;
  document.querySelector('#crumbBrand').textContent = t.brand;
  document.querySelector('#crumbAssistant').textContent = t.assistantLabel;
  const nav = document.querySelectorAll('.nav-item');
  nav[0].innerHTML = `<span class="nav-icon">⌂</span> ${t.navHome}`;
  nav[1].innerHTML = `<span class="nav-icon">▤</span> ${t.navServices}`;
  nav[2].innerHTML = `<span class="nav-icon">ⓘ</span> ${t.navHow}`;
  document.querySelector('#newChat').innerHTML = `<span>＋</span> ${t.newChat}`;
  document.querySelector('#sideLabel').textContent = t.sideLabel;
  document.querySelector('.help-card p').innerHTML = `${t.helpLine1}<br /><strong>${t.helpLine2}</strong>`;
  document.querySelector('.help-card small').textContent = t.helpNote;
  document.querySelector('.eyebrow').innerHTML = `<span class="eyebrow-line"></span> ${t.assistant} <span class="eyebrow-line"></span>`;
  const heading = document.querySelector('.welcome h1');
  heading.innerHTML = `${t.headingA}<br /><span>${t.headingB}</span>`;
  const welcomeCopy = document.querySelector('.welcome-copy');
  welcomeCopy.innerHTML = `${t.welcome}<br class="desktop-break" /> ${t.welcome2}`;
  document.querySelectorAll('.prompt-chip').forEach((chip, i) => {
    const icon = ['📄', '🪪', '🌱'][i];
    chip.innerHTML = `${icon} <span>${[t.chip1, t.chip2, t.chip3][i]}</span><span class="chip-arrow">↗</span>`;
    chip.dataset.question = t.prompts[i];
  });
  input.placeholder = t.placeholder;
  document.querySelector('.input-hint').innerHTML = `<span class="keyboard-icon">↵</span> ${t.enter}`;
  document.querySelector('.composer-note').innerHTML = `<span>✦</span> ${t.note}`;
  document.querySelector('.privacy-pill').innerHTML = `<span></span> ${t.privacy}`;
  document.querySelector('#historyLabel').textContent = t.history;
  document.querySelector('#historyNote').textContent = t.historyNote;
  updateSidebarButton();
  document.querySelector('#chatHistory').setAttribute('aria-label', t.history);
  document.querySelector('#brand').setAttribute('aria-label', `${t.brand} — ${t.navHome}`);
  document.querySelector('#language').setAttribute('aria-label', language === 'mr' ? 'भाषा निवडा' : language === 'hi' ? 'भाषा चुनें' : 'Choose language');
  document.querySelector('#conversation').setAttribute('aria-label', language === 'mr' ? 'संभाषण' : language === 'hi' ? 'बातचीत' : 'Conversation');
  document.querySelector('.composer-wrap').setAttribute('aria-label', language === 'mr' ? 'प्रश्न विचारा' : language === 'hi' ? 'सवाल पूछें' : 'Ask a question');
  input.setAttribute('aria-label', language === 'mr' ? 'तुमचा प्रश्न' : language === 'hi' ? 'आपका सवाल' : 'Your question');
  micButton.setAttribute('aria-label', language === 'mr' ? 'आवाजाने प्रश्न विचारा' : language === 'hi' ? 'आवाज़ से सवाल पूछें' : 'Ask by voice');
  document.querySelector('#sendButton').setAttribute('aria-label', language === 'mr' ? 'प्रश्न पाठवा' : language === 'hi' ? 'सवाल भेजें' : 'Send question');
  document.querySelector('#voiceClose').setAttribute('aria-label', language === 'mr' ? 'आवाज सहाय्यक बंद करा' : language === 'hi' ? 'आवाज़ सहायक बंद करें' : 'Close voice assistant');
  document.querySelector('#voiceClose').title = language === 'mr' ? 'बंद करा' : language === 'hi' ? 'बंद करें' : 'Close';
  document.querySelector('#voiceBackdrop').setAttribute('aria-label', language === 'mr' ? 'बंद करा' : language === 'hi' ? 'बंद करें' : 'Close');
  document.querySelector('title').textContent = `${t.brand} — ${t.headingA} ${t.headingB}`;
  document.querySelectorAll('.message-row.user .message-label').forEach(label => { label.textContent = t.you; });
  document.querySelectorAll('.message-row.assistant .message-label, .voice-message.assistant .voice-message-label').forEach(label => { label.textContent = t.brand; });
  document.querySelectorAll('.voice-message.user .voice-message-label').forEach(label => { label.textContent = t.you; });
  document.querySelector('#voiceModal').setAttribute('aria-label', `${t.brand} — ${voiceCopy[language].title}`);
  document.querySelector('#voiceEyebrow').textContent = `${t.brand} ${language === 'mr' ? 'आवाज सहाय्यक' : language === 'hi' ? 'आवाज़ सहायक' : 'VOICE ASSISTANT'}`;
  document.querySelectorAll('.source-heading').forEach(label => { label.textContent = t.source; });
  document.querySelectorAll('.speak-button').forEach(button => { button.lastChild.textContent = ` ${t.listen}`; });
  document.querySelectorAll('.translate-button').forEach(button => { button.textContent = button.dataset.translated === 'true' ? t.original : t.translate; });
  updateVoiceLanguage(language);
  renderChatHistory();
}

function updateSidebarButton() {
  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  const isOpen = isMobile
    ? document.querySelector('.sidebar').classList.contains('mobile-history-open')
    : !document.querySelector('.app-shell').classList.contains('sidebar-collapsed');
  const label = isOpen ? copy[currentLanguage].sidebarClose : copy[currentLanguage].sidebarOpen;
  const button = document.querySelector('#historyTrigger');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-expanded', String(isOpen));
  document.querySelector('#sidebarBackdrop').setAttribute('aria-label', copy[currentLanguage].sidebarClose);
}

function updateVoiceLanguage(language = currentLanguage) {
  const v = voiceCopy[language];
  document.querySelector('#voiceTitle').textContent = v.title;
  document.querySelector('#voicePrompt').textContent = v.prompt;
  document.querySelector('#voiceHint').textContent = v.hint;
  voiceStart.setAttribute('aria-label', voiceModeActive ? v.stopButton : v.button);
  if (!voiceModeActive && !voiceModeWaiting && !voiceModeSpeaking) voiceStatus.textContent = '';
  if (voiceModeActive && voiceRecognition) {
    const activeRecognition = voiceRecognition;
    voiceRecognition = null;
    try { activeRecognition.stop(); } catch { /* Recognition may already have ended. */ }
  }
}

function loadSavedChats() {
  try {
    const value = JSON.parse(localStorage.getItem(chatStorageKey) || '[]');
    return Array.isArray(value) ? value.filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

function persistSavedChats() {
  try {
    localStorage.setItem(chatStorageKey, JSON.stringify(savedChats.slice(0, 30)));
  } catch {
    showToast(currentLanguage === 'mr' ? 'या ब्राउझरमध्ये चॅट जतन करता आले नाही.' : currentLanguage === 'hi' ? 'इस ब्राउज़र में चैट सहेजी नहीं जा सकी।' : 'Could not save chat history in this browser.');
  }
}

function saveChatMessage(text, type, metadata = {}) {
  if (restoringChat) return;
  if (!activeChatId && type === 'user') {
    activeChatId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  if (!activeChatId) return;
  let chat = savedChats.find(item => item.id === activeChatId);
  if (!chat) {
    chat = { id: activeChatId, title: '', updatedAt: Date.now(), messages: [] };
    savedChats.unshift(chat);
  }
  chat.messages.push({ text, type, language: currentLanguage, sources: metadata.sources || [] });
  if (!chat.title && type === 'user') chat.title = text.replace(/\s+/g, ' ').slice(0, 54);
  chat.updatedAt = Date.now();
  savedChats = savedChats.filter(item => item.messages.length).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  persistSavedChats();
  renderChatHistory();
}

function renderChatHistory() {
  const history = document.querySelector('#chatHistory');
  if (!history) return;
  history.replaceChildren();
  const chats = [...savedChats].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!chats.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = copy[currentLanguage].emptyHistory;
    history.append(empty);
    return;
  }
  chats.forEach(chat => {
    const row = document.createElement('div');
    row.className = `history-row${chat.id === activeChatId ? ' active' : ''}`;
    const open = document.createElement('button');
    open.className = 'history-open';
    open.type = 'button';
    open.textContent = chat.title || copy[currentLanguage].newChat;
    open.title = open.textContent;
    open.addEventListener('click', () => openSavedChat(chat.id));
    const remove = document.createElement('button');
    remove.className = 'history-delete';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${copy[currentLanguage].deleteChat}: ${open.textContent}`);
    remove.title = copy[currentLanguage].deleteChat;
    remove.addEventListener('click', () => deleteSavedChat(chat.id));
    row.append(open, remove);
    history.append(row);
  });
}

function getCurrentChatContext() {
  const chat = savedChats.find(item => item.id === activeChatId);
  if (!chat) return [];
  return chat.messages.slice(-8).map(message => ({
    role: message.type === 'user' ? 'user' : 'assistant',
    text: String(message.text || '').slice(0, 2000)
  })).filter(turn => turn.text.trim());
}

function openSavedChat(id) {
  const chat = savedChats.find(item => item.id === id);
  if (!chat) return;
  activeChatId = chat.id;
  conversation.replaceChildren();
  const lastMessage = chat.messages[chat.messages.length - 1];
  const chatLanguage = lastMessage?.language && copy[lastMessage.language] ? lastMessage.language : currentLanguage;
  welcome.classList.toggle('is-hidden', chat.messages.length > 0);
  restoringChat = true;
  chat.messages.forEach(message => {
    if (message.type === 'assistant') {
      respond('', { answer: message.text, language: message.language || chatLanguage, sources: message.sources || [] });
    } else {
      addMessage(message.text, 'user');
    }
  });
  restoringChat = false;
  renderChatHistory();
  conversation.scrollTop = conversation.scrollHeight;
  if (window.matchMedia('(max-width: 720px)').matches) {
    document.querySelector('.sidebar').classList.remove('mobile-history-open');
    document.querySelector('.sidebar-backdrop').classList.remove('is-visible');
    document.querySelector('.app-shell').classList.remove('sidebar-mobile-open');
    updateSidebarButton();
  }
}

function deleteSavedChat(id) {
  savedChats = savedChats.filter(chat => chat.id !== id);
  persistSavedChats();
  if (activeChatId === id) {
    activeChatId = null;
    conversation.replaceChildren();
    welcome.classList.remove('is-hidden');
  }
  renderChatHistory();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function addMessage(text, type, metadata = {}, persist = true) {
  const row = document.createElement('div');
  row.className = `message-row ${type}`;
  if (type === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'assistant-avatar';
    avatar.textContent = '〰';
    row.append(avatar);
  }
  const content = document.createElement('div');
  content.className = 'message-content';
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = type === 'user' ? copy[currentLanguage].you : copy[currentLanguage].brand;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  content.append(label, bubble);
  row.append(content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  if (persist) saveChatMessage(text, type, metadata);
  return { row, content, bubble };
}

function addVoiceTranscriptMessage(text, type) {
  const row = document.createElement('div');
  row.className = `voice-message ${type}`;
  const label = document.createElement('span');
  label.className = 'voice-message-label';
  label.textContent = type === 'user' ? copy[currentLanguage].you : copy[currentLanguage].brand;
  const bubble = document.createElement('p');
  bubble.className = 'voice-message-bubble';
  bubble.textContent = text;
  row.append(label, bubble);
  voiceTranscript.append(row);
  voiceTranscript.scrollTop = voiceTranscript.scrollHeight;
  return { row, bubble };
}

function updateVoiceTranscriptMessage(message, text) {
  if (!message) return null;
  message.bubble.textContent = text;
  voiceTranscript.scrollTop = voiceTranscript.scrollHeight;
  return message;
}

function findAnswer(question) {
  return answers.find(item => item.match.test(question)) || null;
}

function respond(question, result, existingMessage = null) {
  const found = findAnswer(question);
  const t = copy[currentLanguage];
  const answer = result?.answer || (found
    ? (currentLanguage === 'hi' ? found.answerHi : currentLanguage === 'en' ? found.answerEn : found.answer)
    : currentLanguage === 'hi'
      ? 'इस सवाल के लिए मेरे पास अभी सत्यापित जानकारी नहीं है। कृपया सेवा या ज़िले का नाम स्पष्ट करें, या महाराष्ट्र सरकार के आधिकारिक पोर्टल पर जानकारी देखें।'
      : currentLanguage === 'en'
        ? 'I don’t have verified information for this question yet. Please specify the service or district, or check the official Maharashtra government portal.'
        : 'या प्रश्नासाठी माझ्याकडे सध्या पडताळलेली माहिती उपलब्ध नाही. कृपया सेवा किंवा जिल्ह्याचे नाव थोडे स्पष्ट करा, किंवा अधिकृत महाराष्ट्र शासन पोर्टलवर माहिती तपासा.');
  const sources = result ? (result.sources || []) : (found ? [{ title: found.source, url: found.url, verified_at: found.date }] : []);
  const message = existingMessage || addMessage(answer, 'assistant', { sources });
  const { content, bubble } = message;
  if (existingMessage) saveChatMessage(answer, 'assistant', { sources });
  // addMessage seeds a plain-text bubble; replace it before adding rich answer tools
  // so the same reply is not shown twice.
  bubble.replaceChildren();
  const answerText = document.createElement('div');
  answerText.className = 'answer-text';
  answerText.textContent = answer;
  bubble.append(answerText);
  if (sources.length) {
    const source = document.createElement('div');
    source.className = 'source-box';
    const heading = document.createElement('div');
    heading.className = 'source-heading';
    heading.textContent = t.source;
    source.append(heading);
    sources.forEach(item => {
      if (!item?.url || !item?.title) return;
      const link = document.createElement('a');
      link.className = 'source-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.href = item.url;
      link.textContent = `↗ ${item.title}`;
      source.append(link);
      if (item.verified_at) {
        const meta = document.createElement('div');
        meta.className = 'source-meta';
        meta.textContent = item.verified_at;
        source.append(meta);
      }
    });
    bubble.append(source);
  }
  const tools = document.createElement('div');
  tools.className = 'answer-tools';
  const speak = document.createElement('button');
  speak.className = 'speak-button';
  speak.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12"/></svg> ${t.listen}`;
  let visibleAnswer = answer;
  speak.addEventListener('click', () => speakText(visibleAnswer));

  const targetLanguage = document.createElement('select');
  targetLanguage.className = 'translate-select';
  targetLanguage.setAttribute('aria-label', 'Translate response to');
  const languageOptions = [['mr', 'मराठी'], ['hi', 'हिन्दी'], ['en', 'English']];
  languageOptions.forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    targetLanguage.append(option);
  });
  const sourceLanguage = result?.language || currentLanguage;
  targetLanguage.value = languageOptions.find(([code]) => code !== sourceLanguage)?.[0] || 'mr';

  const translateButton = document.createElement('button');
  translateButton.className = 'translate-button';
  translateButton.textContent = t.translate;
  translateButton.addEventListener('click', async () => {
    const target = targetLanguage.value;
    if (translateButton.dataset.translated === 'true' && target === translateButton.dataset.targetLanguage) {
      answerText.textContent = answer;
      visibleAnswer = answer;
      translateButton.dataset.translated = 'false';
      translateButton.textContent = copy[currentLanguage].translate;
      return;
    }
    translateButton.disabled = true;
    translateButton.textContent = copy[currentLanguage].translating;
    try {
      const response = await fetch(`${apiBase}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: answer, source_language: sourceLanguage, target_language: target })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Translation failed (${response.status}).`);
      answerText.textContent = payload.translation;
      visibleAnswer = payload.translation;
      translateButton.dataset.translated = 'true';
      translateButton.dataset.targetLanguage = target;
      translateButton.textContent = copy[currentLanguage].original;
    } catch (error) {
      showToast(error.message || 'Translation failed. Please try again.');
      translateButton.textContent = copy[currentLanguage].translate;
    } finally {
      translateButton.disabled = false;
    }
  });
  tools.append(speak, targetLanguage, translateButton);
  content.append(tools);
  conversation.scrollTop = conversation.scrollHeight;
  return answer;
}

async function submitQuestion(rawQuestion = input.value, options = {}) {
  const question = rawQuestion.trim();
  if (!question) return;
  const conversationHistory = getCurrentChatContext();
  const voiceSessionId = options.voice ? voiceModeSession : null;
  const canSpeakVoice = () => voiceModeActive && voiceSessionId === voiceModeSession;
  const resumeVoice = () => resumeVoiceRecognition(voiceSessionId);
  if (options.voice) stopActiveVoiceRecognition();
  welcome.classList.add('is-hidden');
  if (options.existingUserMessage) options.existingUserMessage.bubble.textContent = question;
  else addMessage(question, 'user');
  let voiceUserMessage = options.existingVoiceUserMessage || null;
  if (options.voice) {
    if (!voiceUserMessage) voiceUserMessage = addVoiceTranscriptMessage(question, 'user');
    else updateVoiceTranscriptMessage(voiceUserMessage, question);
  }
  input.value = '';
  input.style.height = 'auto';
  conversation.scrollTop = conversation.scrollHeight;
  let streamedAnswerMessage = options.existingAssistantMessage || null;
  let voiceAssistantMessage = options.existingVoiceAssistantMessage || null;
  const showAnswerDraft = partial => {
    if (!streamedAnswerMessage) streamedAnswerMessage = addMessage('', 'assistant', {}, false);
    streamedAnswerMessage.bubble.textContent = partial;
    if (options.voice) {
      if (!voiceAssistantMessage) voiceAssistantMessage = addVoiceTranscriptMessage(partial, 'assistant');
      else updateVoiceTranscriptMessage(voiceAssistantMessage, partial);
    }
    conversation.scrollTop = conversation.scrollHeight;
  };
  try {
    const result = options.precomputedResult || (options.voice && voiceModeActive
      ? await askVoiceBackend(question, showAnswerDraft, voiceSessionId, conversationHistory)
      : await askBackend(question, conversationHistory));
    const answer = respond(question, result, streamedAnswerMessage);
    if (options.voice) {
      if (!voiceAssistantMessage) voiceAssistantMessage = addVoiceTranscriptMessage(answer, 'assistant');
      else updateVoiceTranscriptMessage(voiceAssistantMessage, answer);
    }
    if (options.voice && voiceModeActive && voiceSessionId === voiceModeSession) {
      voiceModeSpeaking = true;
      voiceStatus.textContent = voiceCopy[currentLanguage].speaking;
      if (result.audio_streamed && result.audioStreamPlayer) {
        const streamedAudioPlayed = await result.audioStreamPlayer.finish();
        if (!canSpeakVoice()) return;
        if (streamedAudioPlayed) resumeVoice();
        else if (result.audio_base64) await playVoiceAnswer(result.audio_base64, resumeVoice, canSpeakVoice);
        else if (result.audio_fallback || result.audio_streamed) {
          showVoiceFallbackNotice();
          speakWithBrowser(result.answer, resumeVoice, canSpeakVoice);
        }
        else await speakText(result.answer, resumeVoice, canSpeakVoice);
      } else if (result.audio_fallback) {
        showVoiceFallbackNotice();
        speakWithBrowser(result.answer, resumeVoice, canSpeakVoice);
      } else if (result.audio_base64) {
        await playVoiceAnswer(result.audio_base64, resumeVoice, canSpeakVoice);
      } else {
        await speakText(result.answer, resumeVoice, canSpeakVoice);
      }
    }
  } catch (error) {
    if (options.voice && voiceSessionId !== voiceModeSession) return;
    const message = currentLanguage === 'en'
      ? 'I could not reach the SWAR_AI service. Start the backend and check its configuration, then try again.'
      : currentLanguage === 'hi'
        ? 'स्वर एआई सेवा से संपर्क नहीं हो पाया। बैकएंड शुरू करके उसकी सेटिंग जाँचें और फिर कोशिश करें।'
        : 'स्वर एआय सेवेशी संपर्क झाला नाही. बॅकएंड सुरू आहे आणि त्याची संरचना योग्य आहे याची खात्री करून पुन्हा प्रयत्न करा.';
    if (streamedAnswerMessage) {
      streamedAnswerMessage.bubble.textContent = message;
      saveChatMessage(message, 'assistant');
    } else {
      addMessage(message, 'assistant');
    }
    if (options.voice) {
      if (!voiceAssistantMessage) voiceAssistantMessage = addVoiceTranscriptMessage(message, 'assistant');
      else updateVoiceTranscriptMessage(voiceAssistantMessage, message);
    }
    showToast(error.message || message);
    if (options.voice && voiceModeActive && voiceSessionId === voiceModeSession) {
      voiceModeSpeaking = true;
      voiceStatus.textContent = voiceCopy[currentLanguage].speaking;
      await speakText(message, resumeVoice, canSpeakVoice);
    }
  }
}

async function playVoiceAnswer(audioBase64, onComplete, shouldContinue) {
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    if (onComplete) onComplete();
  };
  if ((shouldContinue && !shouldContinue()) || !audioBase64) { finish(); return; }
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  const audio = new Audio(audioUrl);
  activeAudio = audio;
  const cleanup = () => {
    URL.revokeObjectURL(audioUrl);
    if (activeAudio === audio) activeAudio = null;
    if (activeAudioCleanup === cleanup) activeAudioCleanup = null;
    finish();
  };
  activeAudioCleanup = cleanup;
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  try { await audio.play(); }
  catch {
    cleanup();
    showToast(currentLanguage === 'en' ? 'The live voice answer could not be played.' : currentLanguage === 'hi' ? 'लाइव वॉइस जवाब चल नहीं पाया।' : 'Live आवाजेतील उत्तर प्ले झाले नाही.');
  }
}

function createLiveAudioPlayer() {
  let context = null;
  let nextStartTime = 0;
  let hasChunks = false;
  let startedAny = false;
  let failed = false;
  let chain = Promise.resolve();

  const enqueue = audioBase64 => {
    if (!audioBase64) return;
    hasChunks = true;
    chain = chain.then(async () => {
      if (failed) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio is unavailable.');
        if (!context) context = new AudioContextClass();
        if (context.state === 'suspended') await context.resume();
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        const sampleCount = Math.floor(bytes.length / 2);
        if (!sampleCount) return;
        const audioBuffer = context.createBuffer(1, sampleCount, 24000);
        const samples = audioBuffer.getChannelData(0);
        const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
        for (let index = 0; index < sampleCount; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);
        const startAt = Math.max(context.currentTime + 0.02, nextStartTime);
        source.start(startAt);
        nextStartTime = startAt + audioBuffer.duration;
        startedAny = true;
      } catch {
        failed = true;
      }
    });
  };

  const finish = async () => {
    await chain;
    if (!hasChunks) {
      if (activeLiveAudioPlayer === player) activeLiveAudioPlayer = null;
      return false;
    }
    while (!failed && context && context.state !== 'closed' && context.currentTime < nextStartTime) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (context && context.state !== 'closed') await context.close().catch(() => {});
    if (activeLiveAudioPlayer === player) activeLiveAudioPlayer = null;
    return startedAny && !failed;
  };

  const stop = async () => {
    failed = true;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
    context = null;
    if (activeLiveAudioPlayer === player) activeLiveAudioPlayer = null;
  };

  const player = { enqueue, finish, stop };
  activeLiveAudioPlayer = player;
  return player;
}

async function speakText(text, onComplete, shouldContinue) {
  const canContinue = typeof shouldContinue === 'function' ? shouldContinue : () => true;
  const controller = shouldContinue && typeof AbortController === 'function' ? new AbortController() : null;
  if (controller) activeVoiceSpeechController = controller;
  const releaseController = () => {
    if (controller && activeVoiceSpeechController === controller) activeVoiceSpeechController = null;
  };
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    releaseController();
    if (onComplete) onComplete();
  };
  let response;
  try {
    response = await fetch(`${apiBase}/api/voice/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: currentLanguage, model: voiceModel }),
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch {
    if (controller?.signal.aborted || !canContinue()) { finish(); return; }
    showToast(currentLanguage === 'en' ? 'SWAR_AI is unreachable; using the browser voice.' : currentLanguage === 'hi' ? 'स्वर एआई से संपर्क नहीं हो रहा; ब्राउज़र की आवाज़ इस्तेमाल होगी।' : 'स्वर एआय सेवेशी संपर्क झाला नाही; ब्राउझरचा आवाज वापरला जाईल.');
    speakWithBrowser(text, finish, canContinue);
    return;
  }

  if (!canContinue()) { controller?.abort(); finish(); return; }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (!canContinue()) { finish(); return; }
    showToast(error.detail || (currentLanguage === 'en' ? 'Gemini Native Audio could not generate speech. Check the Gemini API key, model access, and quota.' : currentLanguage === 'hi' ? 'Gemini Native Audio आवाज़ नहीं बना पाया। Gemini API key, model access और quota जाँचें।' : 'Gemini Native Audio आवाज तयार करू शकले नाही. Gemini API key, model access आणि quota तपासा.'));
    speakWithBrowser(text, finish, canContinue);
    return;
  }

  const audioUrl = URL.createObjectURL(await response.blob());
  if (!canContinue()) { URL.revokeObjectURL(audioUrl); finish(); return; }
  const audio = new Audio(audioUrl);
  activeAudio = audio;
  const cleanup = () => {
    URL.revokeObjectURL(audioUrl);
    if (activeAudio === audio) activeAudio = null;
    if (activeAudioCleanup === cleanup) activeAudioCleanup = null;
    finish();
  };
  activeAudioCleanup = cleanup;
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  try {
    await audio.play();
  } catch {
    cleanup();
    showToast(currentLanguage === 'en' ? 'The generated audio could not be played.' : currentLanguage === 'hi' ? 'बनाई गई आवाज़ चल नहीं पाई।' : 'तयार केलेला आवाज प्ले झाला नाही.');
  }
}

function speakWithBrowser(text, onComplete, shouldContinue) {
  if (shouldContinue && !shouldContinue()) { if (onComplete) onComplete(); return; }
  if (!('speechSynthesis' in window)) {
    if (onComplete) onComplete();
    return;
  }
  window.speechSynthesis.cancel();
  const fallback = new SpeechSynthesisUtterance(text);
  fallback.lang = currentLanguage === 'hi' ? 'hi-IN' : currentLanguage === 'en' ? 'en-IN' : 'mr-IN';
  fallback.rate = 0.9;
  fallback.onend = onComplete;
  fallback.onerror = onComplete;
  window.speechSynthesis.speak(fallback);
}

function showVoiceFallbackNotice() {
  if (voiceFallbackNoticeShown) return;
  voiceFallbackNoticeShown = true;
  showToast(currentLanguage === 'en'
    ? 'Gemini Live voice is unavailable right now; this reply is using your device voice.'
    : currentLanguage === 'hi'
      ? 'Gemini Live आवाज़ अभी उपलब्ध नहीं है; इस जवाब में आपके डिवाइस की आवाज़ इस्तेमाल होगी।'
      : 'Gemini Live आवाज सध्या उपलब्ध नाही; या उत्तरासाठी तुमच्या डिव्हाइसचा आवाज वापरला जाईल.');
}

function voiceLanguageTag() {
  return currentLanguage === 'hi' ? 'hi-IN' : currentLanguage === 'en' ? 'en-IN' : 'mr-IN';
}

function stopVoiceSilenceMonitor() {
  clearInterval(voiceSilenceCheckTimer);
  voiceSilenceCheckTimer = null;
  voiceAnalyser = null;
  if (voiceAudioContext) {
    const context = voiceAudioContext;
    voiceAudioContext = null;
    context.close().catch(() => {});
  }
}

function stopVoiceRecordingTracks(targetStream) {
  const isCurrentStream = !targetStream || targetStream === voiceRecorderStream;
  if (isCurrentStream) {
    clearTimeout(voiceRecorderTimer);
    voiceRecorderTimer = null;
    stopVoiceSilenceMonitor();
  }
  const streamToStop = targetStream || voiceRecorderStream;
  if (isCurrentStream) voiceRecorderStream = null;
  if (streamToStop) {
    streamToStop.getTracks().forEach(track => track.stop());
  }
}

function finishVoiceRecording(recorder) {
  if (recorder?.state !== 'recording') return;
  voiceModeWaiting = true;
  voiceStatus.textContent = voiceCopy[currentLanguage].thinking;
  recorder.stop();
}

function monitorVoiceSilence(stream, recorder, sessionId) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    voiceAudioContext = new AudioContextClass();
    const source = voiceAudioContext.createMediaStreamSource(stream);
    voiceAnalyser = voiceAudioContext.createAnalyser();
    voiceAnalyser.fftSize = 1024;
    source.connect(voiceAnalyser);
    voiceAudioContext.resume().catch(() => {});
    const samples = new Uint8Array(voiceAnalyser.fftSize);
    voiceRecordingStartedAt = performance.now();
    voiceSpeechStartedAt = 0;
    voiceLastSoundAt = 0;
    voiceSilenceCheckTimer = setInterval(() => {
      if (!voiceModeActive || sessionId !== voiceModeSession || recorder.state !== 'recording' || !voiceAnalyser) return;
      voiceAnalyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = performance.now();
      if (rms > 0.025) {
        if (!voiceSpeechStartedAt) voiceSpeechStartedAt = now;
        voiceLastSoundAt = now;
      }
      if (voiceSpeechStartedAt && now - voiceSpeechStartedAt > 850 && now - voiceLastSoundAt > 650) {
        finishVoiceRecording(recorder);
      } else if (!voiceSpeechStartedAt && now - voiceRecordingStartedAt > 8000) {
        voiceModeActive = false;
        voiceModeWaiting = false;
        setVoiceButtonState(false);
        voiceStatus.textContent = voiceCopy[currentLanguage].transcriptionFailed;
        recorder.stop();
      }
    }, 100);
  } catch {
    stopVoiceSilenceMonitor();
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('The microphone recording could not be read.'));
    reader.readAsDataURL(blob);
  });
}

async function convertRecordingToPcm16k(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error(voiceCopy[currentLanguage].unsupported);
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const input = decoded.getChannelData(0);
    const ratio = decoded.sampleRate / 16000;
    const sampleCount = Math.max(1, Math.floor(input.length / ratio));
    const pcm = new ArrayBuffer(sampleCount * 2);
    const view = new DataView(pcm);
    for (let index = 0; index < sampleCount; index++) {
      const sample = Math.max(-1, Math.min(1, input[Math.min(input.length - 1, Math.floor(index * ratio))]));
      view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    return new Blob([pcm], { type: 'audio/pcm' });
  } finally {
    await context.close().catch(() => {});
  }
}

async function askVoiceAudioBackend(recording, callbacks = {}, sessionId = voiceModeSession) {
  const pcm = await convertRecordingToPcm16k(recording);
  if (!voiceModeActive || sessionId !== voiceModeSession) return null;
  const audioBase64 = await blobToBase64(pcm);
  if (!voiceModeActive || sessionId !== voiceModeSession) return null;
  const audioStreamPlayer = createLiveAudioPlayer();
  const payload = await readVoiceAnswerStream('/api/voice/answer-audio-stream', {
    audio_base64: audioBase64,
    language: currentLanguage,
    history: getCurrentChatContext(),
    model: voiceModel
  }, {
    ...callbacks,
    onAudio: chunk => {
      if (voiceModeActive && sessionId === voiceModeSession) {
        voiceModeSpeaking = true;
        voiceStatus.textContent = voiceCopy[currentLanguage].speaking;
      }
      audioStreamPlayer.enqueue(chunk);
    }
  });
  if (!voiceModeActive || sessionId !== voiceModeSession) {
    await audioStreamPlayer.stop();
    return null;
  }
  if (!payload.transcript?.trim()) throw new Error(voiceCopy[currentLanguage].transcriptionFailed);
  if (payload.audio_streamed) payload.audioStreamPlayer = audioStreamPlayer;
  return payload;
}

async function startVoiceAudioRecording() {
  if (!voiceModeActive || voiceModeWaiting || voiceModeSpeaking) return;
  const sessionId = voiceModeSession;
  voiceStart.classList.remove('recording');
  voiceStart.classList.add('starting');
  setVoiceButtonState(true);
  voiceStatus.textContent = voiceCopy[currentLanguage].starting;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    voiceModeActive = false;
    voiceStart.classList.remove('starting');
    setVoiceButtonState(false);
    voiceStatus.textContent = voiceCopy[currentLanguage].unsupported;
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    if (!voiceModeActive || sessionId !== voiceModeSession) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    voiceRecorderStream = stream;
    const preferredType = typeof MediaRecorder.isTypeSupported === 'function'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      : undefined;
    const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
    const recorderChunks = [];
    let recordingTimer;
    voiceRecorder = recorder;
    recorder.ondataavailable = event => {
      if (event.data?.size && sessionId === voiceModeSession) recorderChunks.push(event.data);
    };
    recorder.onerror = () => {
      stopVoiceRecordingTracks(stream);
      if (voiceRecorder === recorder) voiceRecorder = null;
      if (sessionId !== voiceModeSession) return;
      voiceModeActive = false;
      voiceModeWaiting = false;
      voiceStart.classList.remove('starting', 'recording');
      setVoiceButtonState(false);
      voiceStatus.textContent = voiceCopy[currentLanguage].transcriptionFailed;
    };
    recorder.onstop = async () => {
      clearTimeout(recordingTimer);
      if (voiceRecorderTimer === recordingTimer) voiceRecorderTimer = null;
      const recording = new Blob(recorderChunks, { type: recorder.mimeType || 'audio/webm' });
      recorderChunks.length = 0;
      stopVoiceRecordingTracks(stream);
      if (voiceRecorder === recorder) voiceRecorder = null;
      if (sessionId !== voiceModeSession) return;
      voiceStart.classList.remove('starting', 'recording');
      setVoiceButtonState(voiceModeActive);
      if (!voiceModeActive) return;
      if (recording.size < 1000) {
        voiceModeActive = false;
        voiceModeWaiting = false;
        setVoiceButtonState(false);
        voiceStatus.textContent = voiceCopy[currentLanguage].transcriptionFailed;
        return;
      }
      voiceModeWaiting = true;
      voiceStatus.textContent = voiceCopy[currentLanguage].thinking;
      let questionDraft = null;
      let answerDraft = null;
      let voiceQuestionDraft = null;
      let voiceAnswerDraft = null;
      const showQuestionDraft = partial => {
        welcome.classList.add('is-hidden');
        if (!questionDraft) questionDraft = addMessage(partial, 'user', {}, false);
        else questionDraft.bubble.textContent = partial;
        if (!voiceQuestionDraft) voiceQuestionDraft = addVoiceTranscriptMessage(partial, 'user');
        else updateVoiceTranscriptMessage(voiceQuestionDraft, partial);
        conversation.scrollTop = conversation.scrollHeight;
      };
      const showAnswerDraft = partial => {
        if (!answerDraft) answerDraft = addMessage('', 'assistant', {}, false);
        answerDraft.bubble.textContent = partial;
        if (!voiceAnswerDraft) voiceAnswerDraft = addVoiceTranscriptMessage(partial, 'assistant');
        else updateVoiceTranscriptMessage(voiceAnswerDraft, partial);
        conversation.scrollTop = conversation.scrollHeight;
      };
      try {
        const result = await askVoiceAudioBackend(recording, {
          onQuestion: showQuestionDraft,
          onAnswer: showAnswerDraft
        }, sessionId);
        if (!result) return;
        if (!questionDraft) questionDraft = addMessage(result.transcript, 'user', {}, false);
        questionDraft.bubble.textContent = result.transcript;
        if (!voiceQuestionDraft) voiceQuestionDraft = addVoiceTranscriptMessage(result.transcript, 'user');
        else updateVoiceTranscriptMessage(voiceQuestionDraft, result.transcript);
        saveChatMessage(result.transcript, 'user');
        await submitQuestion(result.transcript, {
          voice: true,
          precomputedResult: result,
          existingUserMessage: questionDraft,
          existingAssistantMessage: answerDraft,
          existingVoiceUserMessage: voiceQuestionDraft,
          existingVoiceAssistantMessage: voiceAnswerDraft
        });
      } catch (error) {
        if (sessionId !== voiceModeSession) return;
        voiceModeActive = false;
        voiceModeWaiting = false;
        setVoiceButtonState(false);
        voiceStatus.textContent = error.message || voiceCopy[currentLanguage].transcriptionFailed;
        showToast(error.message || voiceCopy[currentLanguage].transcriptionFailed);
        if (questionDraft) saveChatMessage(questionDraft.bubble.textContent, 'user');
        if (answerDraft) {
          answerDraft.bubble.textContent = error.message || voiceCopy[currentLanguage].transcriptionFailed;
          saveChatMessage(answerDraft.bubble.textContent, 'assistant');
        }
        if (voiceAnswerDraft) updateVoiceTranscriptMessage(voiceAnswerDraft, error.message || voiceCopy[currentLanguage].transcriptionFailed);
        else addVoiceTranscriptMessage(error.message || voiceCopy[currentLanguage].transcriptionFailed, 'assistant');
      }
    };
    recorder.start();
    monitorVoiceSilence(stream, recorder, sessionId);
    voiceStart.classList.remove('starting');
    voiceStart.classList.add('recording');
    setVoiceButtonState(true);
    voiceStatus.textContent = voiceCopy[currentLanguage].listening;
    recordingTimer = setTimeout(() => {
      if (recorder.state === 'recording') {
        finishVoiceRecording(recorder);
      }
    }, 30000);
    voiceRecorderTimer = recordingTimer;
  } catch (error) {
    if (stream) stopVoiceRecordingTracks(stream);
    if (sessionId !== voiceModeSession) return;
    voiceModeActive = false;
    voiceStart.classList.remove('starting', 'recording');
    setVoiceButtonState(false);
    voiceStatus.textContent = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      ? voiceCopy[currentLanguage].denied
      : voiceCopy[currentLanguage].unsupported;
  }
}

function startVoiceRecognition() {
  if (!voiceModeActive || voiceModeWaiting || voiceModeSpeaking) return;
  const sessionId = voiceModeSession;
  voiceStart.classList.remove('recording');
  voiceStart.classList.add('starting');
  setVoiceButtonState(true);
  voiceStatus.textContent = voiceCopy[currentLanguage].starting;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    startVoiceAudioRecording();
    return;
  }
  const nextRecognition = new SpeechRecognition();
  let useRecorderFallback = false;
  voiceRecognition = nextRecognition;
  nextRecognition.lang = voiceLanguageTag();
  nextRecognition.interimResults = true;
  nextRecognition.continuous = false;
  nextRecognition.onstart = () => {
    if (voiceModeActive && sessionId === voiceModeSession) {
      voiceStart.classList.remove('starting');
      voiceStart.classList.add('recording');
      setVoiceButtonState(true);
      voiceStatus.textContent = voiceCopy[currentLanguage].listening;
    }
  };
  nextRecognition.onresult = event => {
    if (!voiceModeActive || sessionId !== voiceModeSession) return;
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += `${transcript} `;
      else interimText += transcript;
    }
    if (interimText && !voiceModeWaiting) voiceStatus.textContent = interimText;
    finalText = finalText.trim();
    if (!finalText || voiceModeWaiting) return;
    voiceModeWaiting = true;
    voiceStatus.textContent = voiceCopy[currentLanguage].thinking;
    stopActiveVoiceRecognition();
    submitQuestion(finalText, { voice: true });
  };
  nextRecognition.onerror = event => {
    if (!voiceModeActive || sessionId !== voiceModeSession) return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      if (event.error === 'service-not-allowed') useRecorderFallback = true;
      else {
        voiceModeActive = false;
        voiceStart.classList.remove('starting', 'recording');
        setVoiceButtonState(false);
        voiceStatus.textContent = voiceCopy[currentLanguage].denied;
      }
    } else if (event.error !== 'no-speech' && voiceModeActive) {
      useRecorderFallback = true;
    }
  };
  nextRecognition.onend = () => {
    if (voiceRecognition === nextRecognition) voiceRecognition = null;
    if (sessionId !== voiceModeSession || !voiceModeActive) return;
    voiceStart.classList.remove('recording');
    voiceStart.disabled = false;
    if (voiceModeActive && useRecorderFallback && !voiceModeWaiting && !voiceModeSpeaking) {
      startVoiceAudioRecording();
      return;
    }
    if (voiceModeActive && !voiceModeWaiting && !voiceModeSpeaking) {
      setTimeout(() => {
        if (sessionId === voiceModeSession && voiceModeActive && !voiceModeWaiting && !voiceModeSpeaking) {
          startVoiceRecognition();
        }
      }, 350);
    }
  };
  try {
    nextRecognition.start();
  } catch {
    voiceRecognition = null;
    if (sessionId !== voiceModeSession) return;
    voiceModeActive = false;
    voiceStart.classList.remove('starting', 'recording');
    setVoiceButtonState(false);
    voiceStatus.textContent = voiceCopy[currentLanguage].denied;
  }
}

function resumeVoiceRecognition(sessionId = voiceModeSession) {
  if (sessionId !== voiceModeSession) return;
  voiceModeSpeaking = false;
  voiceModeWaiting = false;
  if (voiceModeActive) {
    voiceStatus.textContent = voiceCopy[currentLanguage].ready;
    setTimeout(() => {
      if (sessionId === voiceModeSession && voiceModeActive) startVoiceRecognition();
    }, 800);
  }
}

function stopActiveVoiceRecognition() {
  const activeRecognition = voiceRecognition;
  if (!activeRecognition) return;
  voiceRecognition = null;
  try { activeRecognition.stop(); } catch { /* Recognition may already have ended. */ }
}

function setVoiceButtonState(active) {
  voiceStart.classList.toggle('is-active', active);
  voiceStart.setAttribute('aria-pressed', String(active));
  voiceStart.setAttribute('aria-label', active
    ? voiceCopy[currentLanguage].stopButton
    : voiceCopy[currentLanguage].button);
  voiceStart.disabled = false;
}

function stopVoiceMode(showStatus = true) {
  voiceModeSession += 1;
  voiceModeActive = false;
  voiceModeWaiting = false;
  voiceModeSpeaking = false;
  if (voiceRecognition) {
    const activeRecognition = voiceRecognition;
    voiceRecognition = null;
    try { activeRecognition.stop(); } catch { /* Recognition may already have ended. */ }
  }
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    const activeRecorder = voiceRecorder;
    voiceRecorder = null;
    try { activeRecorder.stop(); } catch { /* Recorder may already have stopped. */ }
  }
  stopVoiceRecordingTracks();
  if (activeAudio) {
    activeAudio.pause();
    if (activeAudioCleanup) activeAudioCleanup();
    else activeAudio = null;
  }
  if (activeVoiceSpeechController) {
    activeVoiceSpeechController.abort();
    activeVoiceSpeechController = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (activeLiveAudioPlayer) activeLiveAudioPlayer.stop();
  voiceStart.classList.remove('starting', 'recording');
  setVoiceButtonState(false);
  if (showStatus) voiceStatus.textContent = voiceCopy[currentLanguage].stopped;
}

function openVoiceModal() {
  updateVoiceLanguage();
  voiceModal.hidden = false;
  document.body.classList.add('voice-open');
  voiceStart.focus();
}

function closeVoiceModal() {
  stopVoiceMode(false);
  voiceModal.hidden = true;
  document.body.classList.remove('voice-open');
  micButton.focus();
}

function toggleVoiceMode() {
  if (voiceModeActive) {
    stopVoiceMode();
    return;
  }
  voiceModeSession += 1;
  voiceCard.classList.add('has-conversation');
  voiceModeActive = true;
  voiceModeWaiting = false;
  voiceModeSpeaking = false;
  setVoiceButtonState(true);
  startVoiceRecognition();
}

const apiBase = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : window.location.origin;

document.querySelector('#sendButton').addEventListener('click', () => submitQuestion());
document.querySelector('#micButton').addEventListener('click', openVoiceModal);
voiceStart.addEventListener('click', toggleVoiceMode);
document.querySelector('#voiceClose').addEventListener('click', closeVoiceModal);
document.querySelector('#voiceBackdrop').addEventListener('click', closeVoiceModal);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!voiceModal.hidden) {
    closeVoiceModal();
    return;
  }
  if (document.querySelector('.sidebar').classList.contains('mobile-history-open')) {
    document.querySelector('.sidebar').classList.remove('mobile-history-open');
    document.querySelector('.sidebar-backdrop').classList.remove('is-visible');
    document.querySelector('.app-shell').classList.remove('sidebar-mobile-open');
    updateSidebarButton();
  }
});
document.querySelector('#language').value = currentLanguage;
setLanguage(currentLanguage);
requestAnimationFrame(openVoiceModal);
document.querySelector('#newChat').addEventListener('click', () => {
  activeChatId = null;
  conversation.replaceChildren();
  welcome.classList.remove('is-hidden');
  input.value = '';
  renderChatHistory();
  if (window.matchMedia('(max-width: 720px)').matches) {
    document.querySelector('.sidebar').classList.remove('mobile-history-open');
    document.querySelector('.sidebar-backdrop').classList.remove('is-visible');
    document.querySelector('.app-shell').classList.remove('sidebar-mobile-open');
  }
  updateSidebarButton();
  input.focus();
});
document.querySelector('#historyTrigger').addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  const shell = document.querySelector('.app-shell');
  if (window.matchMedia('(max-width: 720px)').matches) {
    const open = sidebar.classList.toggle('mobile-history-open');
    document.querySelector('.sidebar-backdrop').classList.toggle('is-visible', open);
    shell.classList.toggle('sidebar-mobile-open', open);
  } else {
    shell.classList.toggle('sidebar-collapsed');
  }
  updateSidebarButton();
});
document.querySelector('#sidebarBackdrop').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('mobile-history-open');
  document.querySelector('.sidebar-backdrop').classList.remove('is-visible');
  document.querySelector('.app-shell').classList.remove('sidebar-mobile-open');
  updateSidebarButton();
});
document.querySelectorAll('.prompt-chip').forEach(chip => chip.addEventListener('click', () => submitQuestion(chip.dataset.question)));
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
});
document.querySelector('#language').addEventListener('change', event => {
  setLanguage(event.target.value);
});
renderChatHistory();
if (savedChats.length) {
  const latestChat = [...savedChats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  openSavedChat(latestChat.id);
}

async function askBackend(question, history = []) {
  const response = await fetch(`${apiBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, language: currentLanguage, history })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Backend returned ${response.status}`);
  }
  return response.json();
}

async function readVoiceAnswerStream(path, payload, callbacks = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Voice service returned ${response.status}`);
  }
  if (!response.body?.getReader) throw new Error('This browser cannot stream the voice response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const questionParts = [];
  const answerParts = [];
  let buffer = '';
  let finalResponse = null;
  const joinParts = parts => parts.join(' ').replace(/\s+/g, ' ').trim();
  const handleLine = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'question') {
      questionParts.push(event.text || '');
      callbacks.onQuestion?.(joinParts(questionParts));
    } else if (event.type === 'answer') {
      answerParts.push(event.text || '');
      callbacks.onAnswer?.(joinParts(answerParts));
    } else if (event.type === 'audio') {
      callbacks.onAudio?.(event.audio || '');
    } else if (event.type === 'final') {
      finalResponse = event.response;
    } else if (event.type === 'error') {
      throw new Error(event.detail || voiceCopy[currentLanguage].transcriptionFailed);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(handleLine);
      if (done) break;
    }
    if (buffer.trim()) handleLine(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!finalResponse) throw new Error(voiceCopy[currentLanguage].transcriptionFailed);
  return finalResponse;
}

async function askVoiceBackend(question, onAnswer, sessionId = voiceModeSession, history = []) {
  const audioStreamPlayer = createLiveAudioPlayer();
  const result = await readVoiceAnswerStream('/api/voice/answer-stream', {
    question,
    language: currentLanguage,
    history,
    model: voiceModel
  }, {
    onAnswer,
    onAudio: chunk => {
      if (voiceModeActive && sessionId === voiceModeSession) {
        voiceModeSpeaking = true;
        voiceStatus.textContent = voiceCopy[currentLanguage].speaking;
      }
      audioStreamPlayer.enqueue(chunk);
    }
  });
  if (result.audio_streamed) result.audioStreamPlayer = audioStreamPlayer;
  return result;
}
