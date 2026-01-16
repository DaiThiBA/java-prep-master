import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BookOpen, PlusCircle, Brain, CheckCircle, Clock, Trash2, Save, RotateCcw, 
  BarChart3, Sparkles, Loader2, MessageSquare, ListChecks, CopyPlus, 
  Download, Upload, FileJson, Cloud, Wand2,
  Pencil, X, Filter, Tag, AlertTriangle, Star, ShieldAlert, User, Wifi,
  Target, TrendingUp, Award, Map, Mic, MicOff, Send, LogIn, LogOut
} from 'lucide-react';

// Import Firebase
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// --- CẤU HÌNH API GEMINI ---
// const apiKey = ""; 

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// --- CẤU HÌNH FIREBASE ---
// const firebaseConfig = JSON.parse(__firebase_config);
// const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const db = getFirestore(app);
// const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Dùng projectId làm appId cho firestore path
const appId = firebaseConfig.projectId;


// Hàm gọi Gemini API
const callGemini = async (prompt) => {
  const model = "gemini-2.5-flash-preview-09-2025";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Không nhận được phản hồi từ AI.";
    } catch (error) {
      if (i === 4) throw error;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

// --- CONSTANTS ---
const TOPICS = [
  "Java Core", "Java OOP", "Java IO / File", "Exception & Regex", "Collections",
  "SQL & Database", "JDBC", "Frontend Basic", "JSP / Servlet (MVC)",
  "Spring", "Hibernate", "Unit Test", "Mock Project"
];

const LEVELS = ["Basic", "Intermediate", "Advanced"];

const QUESTION_TYPES = [
  "Concept", "Why", "How", "Code", "Debug", "Scenario", "Best Practice"
];

const INTERVIEW_TAGS = [
  "Frequently Asked", "Trap Question", "Must Know", "Nice to Have"
];

// Cấu hình Roadmap
const ROLE_ROADMAPS = {
  "Intern": {
    label: "Backend Intern",
    priorities: ["Java Core", "Java OOP", "Collections", "SQL & Database"],
    minScore: 40
  },
  "Fresher": {
    label: "Fresher Java",
    priorities: ["Java Core", "Java OOP", "SQL & Database", "JDBC", "JSP / Servlet (MVC)", "Spring"],
    minScore: 60
  },
  "Junior": {
    label: "Junior Developer",
    priorities: ["Spring", "Hibernate", "SQL & Database", "Exception & Regex", "Unit Test"],
    minScore: 75
  },
  "MidSenior": {
    label: "Mid/Senior Dev",
    priorities: ["Spring", "Microservices", "Design Patterns", "Mock Project", "Unit Test"],
    minScore: 85
  }
};

export default function App() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState(null); // State để hiển thị lỗi login
  
  const [activeTab, setActiveTab] = useState('study'); 
  const [showAnswer, setShowAnswer] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  
  // Roadmap State
  const [targetRole, setTargetRole] = useState("Intern");

  // Advanced Filter State
  const [filterTopic, setFilterTopic] = useState('All');
  const [filterLevel, setFilterLevel] = useState('All');
  const [filterTag, setFilterTag] = useState('All'); 

  // Add Manual State 
  const [newQuestion, setNewQuestion] = useState({ 
    topic: TOPICS[0], 
    level: LEVELS[0],
    types: [],
    interviewTags: [],
    question: '', 
    answer: '', 
    outline: '' 
  });
  const [generateCount, setGenerateCount] = useState(1);
  
  // Import AI State
  const [importText, setImportText] = useState("");
  const [parsedItems, setParsedItems] = useState([]);
  
  // AI Processing State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);

  // --- WOW FEATURE STATE: MOCK INTERVIEW & VOICE ---
  const [userAnswer, setUserAnswer] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [interviewFeedback, setInterviewFeedback] = useState(null);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);

  // Edit State
  const [editingQuestion, setEditingQuestion] = useState(null); 
  const [editForm, setEditForm] = useState({ 
    question: '', answer: '', outline: '', 
    topic: TOPICS[0], level: LEVELS[0], types: [], interviewTags: []
  });

  const fileInputRef = useRef(null);

  // --- 1. AUTHENTICATION & REDIRECT HANDLING ---
  useEffect(() => {
    const handleAuth = async () => {
      // 1. Kiểm tra xem có phải vừa redirect về không
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("Redirect login success:", result.user);
          // Không cần làm gì thêm, onAuthStateChanged sẽ bắt được user
          return;
        }
      } catch (error) {
        console.error("Redirect login failed:", error);
        setAuthError(error.message); // Hiển thị lỗi cho user
      }

      // 2. Nếu không phải redirect và chưa có user, login ẩn danh để app chạy được
      if (!auth.currentUser) {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            // Chỉ login ẩn danh nếu chưa có user nào (tránh ghi đè khi đang load)
            await signInAnonymously(auth);
          }
        } catch (err) {
          console.error("Anonymous auth failed:", err);
        }
      }
    };

    handleAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setIsLoadingDB(false);
    });
    return () => unsubscribe();
  }, []);

  // --- GOOGLE LOGIN (REDIRECT) ---
  const handleGoogleLogin = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      // Dùng redirect thay vì popup
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Google Login Error:", error);
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Sau khi logout, quay lại chế độ ẩn danh để dùng tiếp
      await signInAnonymously(auth); 
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // --- 2. DATA SYNC ---
  useEffect(() => {
    if (!user) {
      setQuestions([]);
      return;
    }
    const collectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'questions');
    setIsSyncing(true);
    setIsLoadingDB(true);
    
    const unsubscribe = onSnapshot(collectionRef, 
      (snapshot) => {
        const loadedData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setQuestions(loadedData);
        setIsLoadingDB(false);
        setIsSyncing(false);
      },
      (error) => {
        console.error("Firestore sync error:", error);
        setIsLoadingDB(false);
        setIsSyncing(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- STATS CALCULATION (Roadmap) ---
  const topicStats = useMemo(() => {
    const stats = {};
    TOPICS.forEach(topic => {
      const topicQuestions = questions.filter(q => q.topic === topic);
      const total = topicQuestions.length;
      if (total === 0) {
        stats[topic] = { total: 0, score: 0, percent: 0 };
        return;
      }
      
      let rawScore = 0;
      topicQuestions.forEach(q => {
        if (q.status === 'mastered') rawScore += 1;
        else if (q.status === 'review') rawScore += 0.7;
        else if (q.status === 'learning') rawScore += 0.3;
      });

      stats[topic] = {
        total,
        score: rawScore,
        percent: Math.round((rawScore / total) * 100)
      };
    });
    return stats;
  }, [questions]);

  // --- FILTER LOGIC ---
  const applyFilters = (list) => {
    return list.filter(q => {
      const matchTopic = filterTopic === 'All' || q.topic === filterTopic;
      const matchLevel = filterLevel === 'All' || q.level === filterLevel;
      const matchTag = filterTag === 'All' || 
                       (q.types && q.types.includes(filterTag)) || 
                       (q.interviewTags && q.interviewTags.includes(filterTag));
      return matchTopic && matchLevel && matchTag;
    });
  };

  const filteredListQuestions = useMemo(() => applyFilters(questions), [questions, filterTopic, filterLevel, filterTag]);

  const dueQuestions = useMemo(() => {
    const now = new Date();
    let due = questions.filter(q => new Date(q.nextReview) <= now);
    due = applyFilters(due);
    return due.sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
  }, [questions, filterTopic, filterLevel, filterTag]);

  const currentCard = dueQuestions.length > 0 ? dueQuestions[0] : null;

  // --- RESET STATE ON CARD CHANGE ---
  useEffect(() => {
    setShowAnswer(false);
    setShowOutline(false);
    setAiExplanation(null);
    setUserAnswer("");
    setInterviewFeedback(null);
    setIsGrading(false);
    stopListening(); 
  }, [currentCard?.id]);

  // --- HANDLERS (CRUD, AI, Import) ---
  const handleExportData = () => {
    const cleanData = questions.map(({id, ...rest}) => rest);
    const dataStr = JSON.stringify(cleanData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "java_interview_full_backup.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (event) => {
    if (!user) return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (Array.isArray(json)) {
          const batchPromises = json.map(item => {
             const { id, ...data } = item; 
             if (!data.level) data.level = "Basic"; 
             if (!data.types) data.types = [];
             if (!data.interviewTags) data.interviewTags = [];
             
             return addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'questions'), {
               ...data,
               createdAt: serverTimestamp()
             });
          });
          await Promise.all(batchPromises);
          alert(`Đã đồng bộ ${json.length} câu hỏi!`);
        } else {
          alert("File lỗi định dạng.");
        }
      } catch (error) {
        console.error(error);
        alert("Lỗi nhập file.");
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  };

  const processAnswer = async (id, quality) => {
    if (!user) return;
    const questionToUpdate = questions.find(q => q.id === id);
    if (!questionToUpdate) return;

    let { interval, easeFactor, repetitions } = questionToUpdate;
    repetitions = repetitions || 0;

    if (quality < 3) {
      interval = 1;
      repetitions = 0;
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions++;
    }

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    let status = 'learning';
    if (interval > 21) status = 'mastered';
    else if (interval > 10) status = 'review';

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'questions', id);
    await updateDoc(docRef, {
      interval,
      easeFactor,
      repetitions,
      status,
      nextReview: nextDate.toISOString()
    });
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!newQuestion.question || !newQuestion.answer) return;

    const newItem = {
      topic: newQuestion.topic,
      level: newQuestion.level,
      types: newQuestion.types,
      interviewTags: newQuestion.interviewTags,
      question: newQuestion.question,
      answer: newQuestion.answer,
      outline: newQuestion.outline ? newQuestion.outline.split('\n').filter(line => line.trim() !== '') : [],
      nextReview: new Date().toISOString(),
      interval: 0,
      easeFactor: 2.5,
      status: 'new',
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'questions'), newItem);
    setNewQuestion({ 
      topic: TOPICS[0], level: LEVELS[0], types: [], interviewTags: [],
      question: '', answer: '', outline: '' 
    });
    setGenerateCount(1);
    alert('Đã lưu câu hỏi!');
  };

  const handleDelete = async (id) => {
    if (!user) return;
    if(window.confirm("Bạn có chắc muốn xóa?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'questions', id));
    }
  };

  // --- EDIT HANDLERS ---
  const handleEditClick = (q) => {
    setEditingQuestion(q);
    setEditForm({
      question: q.question,
      answer: q.answer,
      outline: q.outline ? q.outline.join('\n') : '',
      topic: q.topic || TOPICS[0],
      level: q.level || LEVELS[0],
      types: q.types || [],
      interviewTags: q.interviewTags || []
    });
  };

  const handleSaveEdit = async () => {
    if (!user || !editingQuestion) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'questions', editingQuestion.id);
      const outlineArray = editForm.outline.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      await updateDoc(docRef, {
        question: editForm.question,
        answer: editForm.answer,
        outline: outlineArray,
        topic: editForm.topic,
        level: editForm.level,
        types: editForm.types,
        interviewTags: editForm.interviewTags
      });

      setEditingQuestion(null);
    } catch (error) {
      console.error("Error updating doc:", error);
      alert("Lỗi khi lưu thay đổi.");
    }
  };

  const toggleArrayItem = (array, item, setter, obj) => {
    const newArray = array.includes(item) 
      ? array.filter(i => i !== item)
      : [...array, item];
    setter({...obj, [setter === setNewQuestion ? 'types' : 'types']: newArray}); 
  };

  const handleAiGenerateQuestion = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const isBulk = generateCount > 1;
      const prompt = `Generate ${generateCount} unique, ${newQuestion.level} level Java interview question(s) about "${newQuestion.topic}". 
      Strictly follow this JSON structure for each object: 
      { 
        "question": "Question text in Vietnamese", 
        "answer": "Answer key points in Vietnamese",
        "outline": ["Hint 1", "Hint 2"],
        "types": ["Concept", "Why", "How"], 
        "interviewTags": ["Frequently Asked", "Must Know"]
      }
      Allowed types: ${QUESTION_TYPES.join(', ')}.
      Allowed interviewTags: ${INTERVIEW_TAGS.join(', ')}.
      Return ONLY raw JSON array.`;
      
      const resultText = await callGemini(prompt);
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      const itemsToSave = Array.isArray(parsed) ? parsed : [parsed];
      
      if (isBulk) {
        const batchPromises = itemsToSave.map(item => {
          return addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'questions'), {
            topic: newQuestion.topic,
            level: newQuestion.level,
            types: item.types || [],
            interviewTags: item.interviewTags || [],
            question: item.question,
            answer: item.answer,
            outline: item.outline || [],
            nextReview: new Date().toISOString(),
            interval: 0,
            easeFactor: 2.5,
            status: 'new',
            createdAt: serverTimestamp()
          });
        });
        await Promise.all(batchPromises);
        alert(`Đã tạo ${itemsToSave.length} câu hỏi!`);
      } else {
        const item = itemsToSave[0];
        setNewQuestion(prev => ({
          ...prev,
          question: item.question,
          answer: item.answer,
          outline: item.outline ? item.outline.join('\n') : '',
          types: item.types || [],
          interviewTags: item.interviewTags || []
        }));
      }
    } catch (error) {
      console.error("AI Error:", error);
      alert("Lỗi AI.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSmartImport = async () => {
    if (!user || !importText.trim()) return;
    setIsGenerating(true);
    setParsedItems([]); 

    try {
      const prompt = `
        Analyze the text. Extract Java interview questions.
        For each, determine:
        1. Topic (Must be one of: ${TOPICS.join(', ')})
        2. Level (Must be one of: ${LEVELS.join(', ')})
        3. Types (Subset of: ${QUESTION_TYPES.join(', ')})
        4. InterviewTags (Subset of: ${INTERVIEW_TAGS.join(', ')})
        
        Return JSON Array:
        [{
          "question": "VN text",
          "answer": "VN text",
          "outline": ["hint1"],
          "topic": "Spring",
          "level": "Intermediate",
          "types": ["Concept"],
          "interviewTags": ["Must Know"]
        }]

        TEXT: ${importText}
      `;

      const resultText = await callGemini(prompt);
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed)) {
        setParsedItems(parsed);
      } else {
        alert("Không tìm thấy câu hỏi hợp lệ.");
      }
    } catch (error) {
      console.error("Import Error:", error);
      alert("Lỗi phân tích.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveImportedItems = async () => {
    if (!user || parsedItems.length === 0) return;
    setIsGenerating(true);
    try {
      const batchPromises = parsedItems.map(item => {
        return addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'questions'), {
          topic: item.topic || "Java Core",
          level: item.level || "Basic",
          types: item.types || [],
          interviewTags: item.interviewTags || [],
          question: item.question,
          answer: item.answer,
          outline: item.outline || [],
          nextReview: new Date().toISOString(),
          interval: 0,
          easeFactor: 2.5,
          status: 'new',
          createdAt: serverTimestamp()
        });
      });
      await Promise.all(batchPromises);
      alert(`Đã lưu ${parsedItems.length} câu!`);
      setImportText("");
      setParsedItems([]);
      setActiveTab('list');
    } catch (error) {
      console.error("Save Import Error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiExplain = async () => {
    const currentCard = dueQuestions[0];
    if (!currentCard) return;
    setIsExplaining(true);
    try {
      const prompt = `Explain strictly for level "${currentCard.level || 'Basic'}".
      Question: "${currentCard.question}"
      Answer: "${currentCard.answer}"
      Topic: "${currentCard.topic}"
      
      Provide detailed explanation, code example (if type contains 'Code'), and why it's important. Tone: Professional interviewer. Language: Vietnamese.`;
      const result = await callGemini(prompt);
      setAiExplanation(result);
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsExplaining(false);
    }
  };

  // --- WOW FEATURE: INTERVIEW GRADING & VOICE ---
  
  // Voice Handlers
  const toggleListening = () => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert("Trình duyệt của bạn không hỗ trợ Voice Recognition. Hãy thử dùng Chrome.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Key for "not auto-stop"
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
    };

    recognition.onresult = (event) => {
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final += event.results[i][0].transcript + ' ';
            }
        }
        if (final) {
            setUserAnswer(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + final);
        }
    };

    recognition.onerror = (e) => {
      console.error("Voice Error", e);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          stopListening();
          alert("Vui lòng cấp quyền micro để sử dụng tính năng này.");
      }
    };

    recognition.onend = () => {
      // Auto-restart if user didn't stop explicitly
      if (isListeningRef.current) {
        try { recognition.start(); } catch (e) { /* already started */ }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
  };

  const handleAiGrade = async () => {
    if (!currentCard || !userAnswer.trim()) return;
    setIsGrading(true);
    try {
      const prompt = `You are a strict Java Technical Interviewer. Compare the candidate's answer with the standard answer.
      
      Question: "${currentCard.question}"
      Standard Answer: "${currentCard.answer}"
      Candidate Answer (Input): "${userAnswer}"

      Provide feedback in Vietnamese using Markdown:
      1. **Đánh giá:** (General rating)
      2. **✅ Điểm cộng:** (What they got right)
      3. **⚠️ Thiếu sót/Cần cải thiện:** (What they missed or where they rambled)
      4. **💡 Cách trả lời tốt hơn:** (Brief suggestion)
      Keep it constructive but strict.`;

      const result = await callGemini(prompt);
      setInterviewFeedback(result);
    } catch (error) {
      console.error("Grading Error:", error);
      alert("Lỗi AI chấm điểm.");
    } finally {
      setIsGrading(false);
    }
  };

  // --- UI HELPERS ---
  const getLevelColor = (level) => {
    switch(level) {
      case 'Basic': return 'bg-green-100 text-green-700 border-green-200';
      case 'Intermediate': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Advanced': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'mastered': return 'bg-emerald-500 text-white border-emerald-600';
      case 'review': return 'bg-amber-500 text-white border-amber-600';
      case 'learning': return 'bg-sky-500 text-white border-sky-600';
      default: return 'bg-slate-400 text-white border-slate-500';
    }
  };

  // --- ROADMAP HELPER ---
  const getPrioritySuggestion = () => {
    const roleConfig = ROLE_ROADMAPS[targetRole];
    let lowestTopic = null;
    let lowestScore = 100;

    roleConfig.priorities.forEach(topic => {
      const stats = topicStats[topic] || { percent: 0 };
      if (stats.percent < roleConfig.minScore && stats.percent < lowestScore) {
        lowestScore = stats.percent;
        lowestTopic = topic;
      }
    });

    if (lowestTopic) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
          <div className="bg-amber-100 p-2 rounded-full text-amber-600 shrink-0"><AlertTriangle size={20}/></div>
          <div>
            <h4 className="font-bold text-amber-800 text-sm">Gợi ý ôn tập:</h4>
            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
              Để phỏng vấn <strong>{roleConfig.label}</strong>, bạn cần ưu tiên cải thiện <strong>{lowestTopic}</strong> ngay (Hiện tại: {Math.round(lowestScore)}%). 
              <button 
                onClick={() => { setFilterTopic(lowestTopic); setActiveTab('study'); }}
                className="ml-1 underline font-bold hover:text-amber-900"
              >
                Học ngay &rarr;
              </button>
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3 items-center animate-in fade-in">
        <div className="bg-green-100 p-2 rounded-full text-green-600"><Award size={20}/></div>
        <div>
          <h4 className="font-bold text-green-800 text-sm">Tuyệt vời!</h4>
          <p className="text-green-700 text-xs">Bạn đã nắm vững các kiến thức nền tảng cho vị trí {roleConfig.label}. Hãy ôn luyện thêm các câu hỏi nâng cao!</p>
        </div>
      </div>
    );
  };

  // --- COMPONENTS ---

  const FilterBar = () => (
    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-4 flex flex-col md:flex-row gap-3">
      <div className="flex-1">
        <label className="text-xs font-bold text-slate-500 block mb-1">Topic</label>
        <select 
          className="w-full p-2 bg-slate-50 rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-200"
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
        >
          <option value="All">Tất cả Topic</option>
          {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex-1">
        <label className="text-xs font-bold text-slate-500 block mb-1">Level</label>
        <select 
          className="w-full p-2 bg-slate-50 rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-200"
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
        >
          <option value="All">Tất cả Level</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="flex-1">
        <label className="text-xs font-bold text-slate-500 block mb-1">Tag (Type/Interview)</label>
        <select 
          className="w-full p-2 bg-slate-50 rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-200"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="All">Tất cả Tag</option>
          <optgroup label="Interview Tags">
            {INTERVIEW_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
          <optgroup label="Types">
            {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </select>
      </div>
    </div>
  );

  const EditModal = () => {
    if (!editingQuestion) return null;
    const toggleEditItem = (field, item) => {
      const list = editForm[field];
      const newList = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
      setEditForm({...editForm, [field]: newList});
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Pencil size={18} className="text-indigo-600"/> Chỉnh sửa chi tiết
            </h3>
            <button onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-slate-600">
              <X size={24} />
            </button>
          </div>
          <div className="space-y-4 flex-1">
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Topic</label>
                  <select className="w-full p-2 bg-slate-50 border rounded-lg text-sm" value={editForm.topic} onChange={(e) => setEditForm({...editForm, topic: e.target.value})}>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Level</label>
                  <select className="w-full p-2 bg-slate-50 border rounded-lg text-sm" value={editForm.level} onChange={(e) => setEditForm({...editForm, level: e.target.value})}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
               </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Question Type</label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map(type => (
                  <button key={type} onClick={() => toggleEditItem('types', type)} className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.types.includes(type) ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{type}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Interview Tags</label>
              <div className="flex flex-wrap gap-2">
                {INTERVIEW_TAGS.map(tag => (
                  <button key={tag} onClick={() => toggleEditItem('interviewTags', tag)} className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.interviewTags.includes(tag) ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{tag}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Câu hỏi</label>
              <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[80px]" value={editForm.question} onChange={(e) => setEditForm({...editForm, question: e.target.value})}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gợi ý dàn ý (Mỗi dòng 1 ý)</label>
              <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[80px]" value={editForm.outline} onChange={(e) => setEditForm({...editForm, outline: e.target.value})}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Câu trả lời</label>
              <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[150px]" value={editForm.answer} onChange={(e) => setEditForm({...editForm, answer: e.target.value})}/>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
             <button onClick={() => setEditingQuestion(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Hủy</button>
             <button onClick={handleSaveEdit} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700">Lưu thay đổi</button>
          </div>
        </div>
      </div>
    );
  };

  const MultiSelectBadges = ({ options, selected, onChange, colorClass }) => (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => { const newSel = selected.includes(opt) ? selected.filter(i => i !== opt) : [...selected, opt]; onChange(newSel); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selected.includes(opt) ? `${colorClass} shadow-sm transform scale-105` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{opt}</button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-0">
      <EditModal />

      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Brain className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Java Prep Master</h1>
              <p className="text-[10px] opacity-80 uppercase tracking-widest font-semibold flex items-center gap-1">
                Powered by Gemini <Sparkles size={10} />
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {/* Sync Status */}
             <div className="text-indigo-100 text-xs md:text-sm flex items-center gap-2">
               {isSyncing ? <><Loader2 size={14} className="animate-spin"/> Syncing...</> : <><Cloud size={14} className="text-green-300"/> Saved</>}
             </div>
             
             {/* User Profile & Auth */}
             {user && !user.isAnonymous ? (
                <div className="flex items-center gap-3 pl-4 border-l border-indigo-500">
                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-xs font-bold">{user.displayName || user.email || "User"}</span>
                    <span className="text-[10px] text-indigo-200">Premium Member</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-2 rounded-full bg-indigo-700 hover:bg-indigo-800 transition-colors"
                    title="Đăng xuất"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
             ) : (
                <div className="flex flex-col items-end">
                  <button 
                    onClick={handleGoogleLogin}
                    className="flex items-center gap-2 bg-white text-indigo-600 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm"
                  >
                    <LogIn size={14} /> Login Google
                  </button>
                  {authError && <span className="text-[10px] text-red-200 mt-1 max-w-[150px] truncate" title={authError}>Lỗi: {authError}</span>}
                </div>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 mt-4">
        
        {/* Helper Alert */}
        {user && user.isAnonymous && (
           <div className="mb-6 bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center gap-3 text-sm text-blue-800">
              <User size={18} />
              <span>Bạn đang dùng chế độ <strong>Khách</strong>. Hãy đăng nhập Google để lưu dữ liệu vĩnh viễn và đồng bộ.</span>
           </div>
        )}

        <div className="flex bg-white rounded-xl shadow-sm p-1 mb-6 overflow-x-auto">
          <button onClick={() => setActiveTab('study')} className={`flex-1 min-w-[80px] py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'study' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}><BookOpen size={18} /><span className="hidden sm:inline">Học</span> <span className="text-xs">({dueQuestions.length})</span></button>
          <button onClick={() => setActiveTab('roadmap')} className={`flex-1 min-w-[80px] py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'roadmap' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}><Map size={18}/><span className="hidden sm:inline">Lộ trình</span></button>
          <button onClick={() => setActiveTab('add')} className={`flex-1 min-w-[80px] py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'add' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}><PlusCircle size={18} /><span className="hidden sm:inline">Thêm</span></button>
          <button onClick={() => setActiveTab('import')} className={`flex-1 min-w-[100px] py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'import' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}><Wand2 size={18} /><span className="hidden sm:inline">Import AI</span></button>
          <button onClick={() => setActiveTab('list')} className={`flex-1 min-w-[80px] py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'list' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}><BarChart3 size={18} /><span className="hidden sm:inline">Quản lý</span></button>
        </div>

        {/* --- STUDY MODE --- */}
        {activeTab === 'study' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <FilterBar />
            
            {isLoadingDB ? (
              <div className="text-center py-20 text-slate-400 flex flex-col items-center">
                 <Loader2 size={32} className="animate-spin mb-2"/>
                 <span>Đang tải dữ liệu...</span>
              </div>
            ) : currentCard ? (
              <div className="flex flex-col gap-4">
                <div className="text-center text-sm text-slate-500 mb-2">
                  <span className="font-bold text-indigo-600">
                    {filterTopic !== 'All' ? filterTopic : 'Tất cả'} - {filterLevel !== 'All' ? filterLevel : 'Mọi trình độ'}
                  </span>: Còn {dueQuestions.length} câu cần ôn
                </div>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 min-h-[300px] flex flex-col">
                  {/* Card Header */}
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{currentCard.topic}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-md font-bold w-fit ${getLevelColor(currentCard.level)}`}>{currentCard.level || 'Basic'}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded border font-medium ${getStatusColor(currentCard.status)}`}>
                        {currentCard.status === 'new' ? 'MỚI' : currentCard.status.toUpperCase()}
                      </span>
                    </div>
                    {/* Tags Row */}
                    <div className="flex flex-wrap gap-1">
                      {currentCard.interviewTags?.map(tag => (
                        <span key={tag} className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
                          <Star size={8} fill="currentColor" /> {tag}
                        </span>
                      ))}
                      {currentCard.types?.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Question */}
                  <div className="p-8 flex-1 flex flex-col items-center justify-center text-center">
                    <h3 className="text-2xl font-semibold text-slate-800 mb-4 leading-relaxed">
                      {currentCard.question}
                    </h3>

                    {/* Hints */}
                    {showOutline && !showAnswer && currentCard.outline && currentCard.outline.length > 0 && (
                      <div className="w-full max-w-md mx-auto mt-6 bg-yellow-50 p-4 rounded-xl border border-yellow-100 animate-in fade-in slide-in-from-bottom-2 text-left">
                        <h4 className="text-xs font-bold text-yellow-700 uppercase mb-2 flex items-center gap-1"><ListChecks size={14} /> Gợi ý</h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">{currentCard.outline.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                      </div>
                    )}
                    
                    {/* --- WOW FEATURE: MOCK INTERVIEW --- */}
                    <div className="w-full mt-6 text-left border-t border-indigo-50 pt-4">
                        <h4 className="text-sm font-bold text-indigo-700 mb-2 flex items-center gap-2">
                          <Mic size={16} /> Luyện tập trả lời phỏng vấn
                        </h4>
                        
                        {!interviewFeedback ? (
                          <div className="flex flex-col gap-2">
                            <div className="relative">
                              <textarea 
                                className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all pr-10"
                                placeholder="Nhập câu trả lời hoặc bấm Mic để nói..."
                                rows={3}
                                value={userAnswer}
                                onChange={(e) => setUserAnswer(e.target.value)}
                              />
                              <button 
                                onClick={toggleListening}
                                className={`absolute top-2 right-2 p-2 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-400 hover:text-indigo-600 border border-slate-200'}`}
                                title={isListening ? "Đang nghe... Bấm để dừng" : "Bấm để nói"}
                              >
                                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                              </button>
                            </div>
                            
                            <button 
                              onClick={handleAiGrade}
                              disabled={isGrading || !userAnswer.trim()}
                              className="self-end bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
                            >
                              {isGrading ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Chấm điểm
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white border border-indigo-200 rounded-lg p-4 shadow-sm text-left animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between items-start mb-2">
                              <h5 className="font-bold text-indigo-800 text-sm flex items-center gap-2"><User size={14}/> Review từ Interviewer AI:</h5>
                              <button onClick={() => setInterviewFeedback(null)} className="text-xs text-slate-400 hover:text-indigo-600 underline">Thử lại</button>
                            </div>
                            <div className="prose prose-sm prose-indigo text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">
                              {interviewFeedback}
                            </div>
                          </div>
                        )}
                    </div>

                    {!showAnswer && !showOutline && <p className="text-slate-400 text-sm italic mt-8">(Tự trả lời trước khi xem đáp án)</p>}

                    {/* Answer Reveal */}
                    {showAnswer && (
                      <div className="w-full mt-6 pt-6 border-t border-dashed border-slate-200 animate-in zoom-in-95 duration-300">
                        <div className="text-left bg-slate-50 p-4 rounded-lg text-slate-700 whitespace-pre-line leading-7 mb-4">
                          <span className="font-bold text-indigo-600 block mb-2">Đáp án gợi ý:</span>
                          {currentCard.answer}
                        </div>

                        {!aiExplanation ? (
                          <button onClick={handleAiExplain} disabled={isExplaining} className="text-sm font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 w-full border border-purple-200 border-dashed">
                            {isExplaining ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} />}
                            {isExplaining ? "AI đang suy nghĩ..." : "Giải thích chi tiết (Mentor AI)"}
                          </button>
                        ) : (
                          <div className="mt-4 bg-purple-50 p-4 rounded-lg border border-purple-100 text-left text-sm text-slate-700 animate-in fade-in slide-in-from-top-2">
                             <h4 className="font-bold text-purple-700 flex items-center gap-2 mb-2"><MessageSquare size={16}/> Mentor AI giải thích:</h4>
                             <div className="prose prose-sm prose-purple whitespace-pre-wrap leading-relaxed">{aiExplanation}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="p-4 bg-slate-50 border-t border-slate-200 z-10 space-y-2">
                    {!showAnswer ? (
                      <div className="flex gap-2">
                        {!showOutline && (
                          <button onClick={() => setShowOutline(true)} className="flex-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                            <ListChecks size={18} /> Gợi ý
                          </button>
                        )}
                        <button onClick={() => setShowAnswer(true)} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-indigo-200">
                          Hiện Đáp Án
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => processAnswer(currentCard.id, 0)} className="flex flex-col items-center p-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700"><RotateCcw size={20} className="mb-1" /><span className="text-xs font-bold">Quên</span><span className="text-[10px]">1 ngày</span></button>
                        <button onClick={() => processAnswer(currentCard.id, 3)} className="flex flex-col items-center p-2 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700"><Clock size={20} className="mb-1" /><span className="text-xs font-bold">Khó</span><span className="text-[10px]">2 ngày</span></button>
                        <button onClick={() => processAnswer(currentCard.id, 4)} className="flex flex-col items-center p-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700"><CheckCircle size={20} className="mb-1" /><span className="text-xs font-bold">Được</span><span className="text-[10px]">3 ngày</span></button>
                        <button onClick={() => processAnswer(currentCard.id, 5)} className="flex flex-col items-center p-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700"><Brain size={20} className="mb-1" /><span className="text-xs font-bold">Dễ</span><span className="text-[10px]">7 ngày+</span></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-10 h-10 text-green-600" /></div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Đã hoàn thành!</h3>
                <p className="text-slate-500 max-w-xs mx-auto mb-4">Bạn đã ôn hết các thẻ thuộc bộ lọc hiện tại.</p>
                <button onClick={() => { setFilterTopic('All'); setFilterLevel('All'); setFilterTag('All'); }} className="text-indigo-600 font-medium hover:text-indigo-800 text-sm underline">Xóa bộ lọc để xem tiếp</button>
              </div>
            )}
          </div>
        )}

        {/* --- ROADMAP MODE --- */}
        {activeTab === 'roadmap' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Target className="text-red-500" /> Mục tiêu của bạn là gì?
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.keys(ROLE_ROADMAPS).map(role => (
                  <button
                    key={role}
                    onClick={() => setTargetRole(role)}
                    className={`p-3 rounded-xl border text-sm font-bold transition-all
                      ${targetRole === role 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' 
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white'}`}
                  >
                    {ROLE_ROADMAPS[role].label}
                  </button>
                ))}
              </div>
            </div>

            {getPrioritySuggestion()}

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp className="text-indigo-500" /> Chỉ số sức mạnh
              </h3>
              <div className="space-y-4">
                {TOPICS.map(topic => {
                  const stats = topicStats[topic] || { total: 0, percent: 0 };
                  const isPriority = ROLE_ROADMAPS[targetRole].priorities.includes(topic);
                  
                  return (
                    <div key={topic} className={`group ${isPriority ? 'opacity-100' : 'opacity-50 hover:opacity-100 transition-opacity'}`}>
                      <div className="flex justify-between items-end mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isPriority ? 'text-indigo-900 font-bold' : 'text-slate-600'}`}>
                            {topic}
                          </span>
                          {isPriority && <Star size={12} className="text-amber-400 fill-amber-400" />}
                        </div>
                        <span className="text-xs font-bold text-slate-500">{stats.percent}% ({stats.total} câu)</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            stats.percent >= ROLE_ROADMAPS[targetRole].minScore ? 'bg-green-500' : 
                            isPriority ? 'bg-indigo-500' : 'bg-slate-400'
                          }`}
                          style={{ width: `${stats.percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- ADD MODE --- */}
        {activeTab === 'add' && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><PlusCircle className="text-indigo-600" /> Tạo thẻ mới</h2>
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Topic (Bắt buộc)</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" value={newQuestion.topic} onChange={(e) => setNewQuestion({...newQuestion, topic: e.target.value})}>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Level (Bắt buộc)</label>
                  <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" value={newQuestion.level} onChange={(e) => setNewQuestion({...newQuestion, level: e.target.value})}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500">Question Type (Nên có)</label>
                <MultiSelectBadges options={QUESTION_TYPES} selected={newQuestion.types} onChange={(val) => setNewQuestion({...newQuestion, types: val})} colorClass="bg-indigo-100 text-indigo-700 border-indigo-200" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500">Interview Tags (Quan trọng)</label>
                <MultiSelectBadges options={INTERVIEW_TAGS} selected={newQuestion.interviewTags} onChange={(val) => setNewQuestion({...newQuestion, interviewTags: val})} colorClass="bg-amber-100 text-amber-700 border-amber-200" />
              </div>
              
              <div className="pt-2">
                 <div className="flex items-center gap-2 mb-1">
                    <label className="text-sm font-medium text-slate-700">Câu hỏi</label>
                    <div className="flex-1"></div>
                    <div className="flex items-center bg-slate-50 border rounded px-2">
                      <span className="text-[10px] text-slate-500 mr-1">SL AI:</span>
                      <input type="number" min="1" max="10" value={generateCount} onChange={(e) => setGenerateCount(e.target.value)} className="w-8 p-1 bg-transparent text-center font-bold text-indigo-600 text-xs focus:outline-none"/>
                    </div>
                    <button type="button" onClick={handleAiGenerateQuestion} disabled={isGenerating} className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-md font-bold flex items-center gap-1 hover:bg-purple-200 transition-colors">
                      {isGenerating ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Soạn
                    </button>
                 </div>
                 <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[80px]" value={newQuestion.question} onChange={(e) => setNewQuestion({...newQuestion, question: e.target.value})} required={generateCount === 1}/>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gợi ý dàn ý</label>
                <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[60px]" placeholder="- Ý 1..." value={newQuestion.outline} onChange={(e) => setNewQuestion({...newQuestion, outline: e.target.value})}/>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Câu trả lời</label>
                <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none min-h-[120px]" value={newQuestion.answer} onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})} required={generateCount === 1}/>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-100">Lưu Thẻ</button>
            </form>
          </div>
        )}

        {/* --- IMPORT MODE --- */}
        {activeTab === 'import' && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Wand2 className="text-indigo-600" /> Smart Import</h2>
            {parsedItems.length === 0 ? (
              <div className="space-y-4">
                <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[200px] text-sm font-mono" placeholder="Dán nội dung..." value={importText} onChange={(e) => setImportText(e.target.value)} />
                <button onClick={handleSmartImport} disabled={isGenerating || !importText.trim()} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
                  {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Wand2 size={20} />} Phân tích & Tạo Quiz
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center"><h3 className="font-bold text-slate-700">Kết quả ({parsedItems.length} câu)</h3><button onClick={() => setParsedItems([])} className="text-xs text-red-500">Hủy</button></div>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {parsedItems.map((item, index) => (
                    <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm relative group">
                      <button onClick={() => {const n=[...parsedItems];n.splice(index,1);setParsedItems(n)}} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={16}/></button>
                      <div className="font-bold text-indigo-700 mb-1">{item.question}</div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[10px] bg-slate-200 px-2 rounded text-slate-600">{item.topic}</span>
                        <span className={`text-[10px] px-2 rounded ${getLevelColor(item.level)}`}>{item.level}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={handleSaveImportedItems} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg">Lưu tất cả</button>
              </div>
            )}
          </div>
        )}

        {/* --- LIST MODE --- */}
        {activeTab === 'list' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <FilterBar />
            
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center">
              <h3 className="font-bold text-slate-700 flex items-center gap-2 mr-auto"><FileJson size={18} /> Backup</h3>
              <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
              <button onClick={() => fileInputRef.current.click()} className="bg-white hover:bg-slate-50 text-slate-700 py-1.5 px-3 rounded-lg border text-xs font-bold flex gap-1"><Upload size={14}/> Import</button>
              <button onClick={handleExportData} className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold flex gap-1"><Download size={14}/> Export</button>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold text-slate-800">Danh sách ({filteredListQuestions.length})</h2>
              </div>
              
              {filteredListQuestions.length === 0 ? <div className="text-center text-slate-400 py-10">Không tìm thấy câu hỏi nào.</div> : (
                <div className="grid gap-3">
                  {filteredListQuestions.map((q) => (
                    <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group relative">
                      <div className="flex justify-between items-start mb-2 pr-16">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold uppercase text-slate-500">{q.topic}</span>
                             <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getLevelColor(q.level)}`}>{q.level || 'Basic'}</span>
                          </div>
                          <h4 className="font-medium text-slate-800 line-clamp-2">{q.question}</h4>
                        </div>
                      </div>
                      
                      {/* Tags Row */}
                      <div className="flex flex-wrap gap-1 mt-2">
                         {q.interviewTags?.map(tag => (
                           <span key={tag} className="text-[9px] px-1.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{tag}</span>
                         ))}
                         {q.types?.map(t => (
                           <span key={t} className="text-[9px] px-1.5 rounded bg-slate-100 text-slate-500">{t}</span>
                         ))}
                      </div>

                      <div className="absolute top-4 right-4 flex gap-1">
                         <button onClick={() => handleEditClick(q)} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Pencil size={16}/></button>
                         <button onClick={() => handleDelete(q.id)} className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}