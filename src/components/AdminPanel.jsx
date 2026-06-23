import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Plus, Edit, Trash2, Download, UploadCloud, RefreshCw, 
  X, Eye, ArrowLeft 
} from 'lucide-react';

export default function AdminPanel({ onExit }) {
  // Exams & questions state
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  
  // Active states
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'students'
  
  // Exam creation & renaming states
  const [newExamName, setNewExamName] = useState('');
  const [showExamModal, setShowExamModal] = useState(false); // 'create' | 'rename' | null
  const [examModalMode, setExamModalMode] = useState('create');
  
  // Question CRUD form states
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [qNumber, setQNumber] = useState(1);
  const [qText, setQText] = useState('');
  const [qCategory, setQCategory] = useState('데이터 분석');
  const [qType, setQType] = useState('multiple-choice'); // 'multiple-choice' | 'short-answer'
  const [qOptions, setQOptions] = useState(['', '', '', '']);
  const [qCorrectIndex, setQCorrectIndex] = useState(0);
  const [qShortAnswers, setQShortAnswers] = useState('');
  const [qPlaceholder, setQPlaceholder] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qTimeLimit, setQTimeLimit] = useState(120); // default 2 minutes
  const [qReference, setQReference] = useState('');
  const [qAiduEnabled, setQAiduEnabled] = useState(false);

  // CSV/JSON drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [importMessage, setImportMessage] = useState(null);

  // Student results modal state
  const [selectedAttemptForView, setSelectedAttemptForView] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState([]);
  const [isAnswersLoading, setIsAnswersLoading] = useState(false);
  const [csvUrlInput, setCsvUrlInput] = useState('');

  async function fetchExams() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('Exam')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      setExams(data || []);
      if (data && data.length > 0) {
        setSelectedExamId(data[0].id.toString());
      }
    } catch (e) {
      console.error(e);
      alert('시험 목록 로드 실패: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchQuestions(examId) {
    try {
      const { data, error } = await supabase
        .from('QuizQuestion')
        .select('*')
        .eq('exam', parseInt(examId))
        .order('questionNumber', { ascending: true });

      if (error) throw error;
      setQuestions(data || []);
      // Set next question number
      if (data && data.length > 0) {
        setQNumber(Math.max(...data.map(q => q.questionNumber)) + 1);
      } else {
        setQNumber(1);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchAttempts(examId) {
    try {
      const { data, error } = await supabase
        .from('QuizAttempt')
        .select('*, User(*)')
        .eq('exam', parseInt(examId))
        .order('startedAt', { ascending: false });

      if (error) throw error;
      setAttempts(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  // Load basic details
  useEffect(() => {
    setTimeout(() => {
      fetchExams();
    }, 0);
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      setTimeout(() => {
        fetchQuestions(selectedExamId);
        fetchAttempts(selectedExamId);
      }, 0);
    } else {
      setTimeout(() => {
        setQuestions([]);
        setAttempts([]);
      }, 0);
    }
  }, [selectedExamId]);

  useEffect(() => {
    if (activeExam) {
      const isUrl = activeExam.csvData && (activeExam.csvData.startsWith('http://') || activeExam.csvData.startsWith('https://'));
      setCsvUrlInput(isUrl ? activeExam.csvData : '');
    } else {
      setCsvUrlInput('');
    }
  }, [selectedExamId, exams]);

  // Real-time student subscription
  useEffect(() => {
    if (!selectedExamId) return;

    // Listen to inserts/updates/deletes on QuizAttempt for this exam
    const attemptChannel = supabase
      .channel('admin_quiz_attempts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'QuizAttempt',
        filter: `exam=eq.${selectedExamId}`
      }, (payload) => {
        console.log('QuizAttempt change received:', payload);
        fetchAttempts(selectedExamId); // Refresh logs table
      })
      .subscribe();

    return () => {
      supabase.removeChannel(attemptChannel);
    };
  }, [selectedExamId]);

  // Exam Operations
  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!newExamName.trim()) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('Exam')
        .insert([{
          name: newExamName.trim(),
          timeMode: 'total',
          totalTimeLimit: 30,
          updatedAt: Date.now()
        }])
        .select()
        .single();

      if (error) throw error;
      setExams([...exams, data]);
      setSelectedExamId(data.id.toString());
      setNewExamName('');
      setShowExamModal(false);
    } catch (err) {
      console.error(err);
      alert('시험지 생성 오류: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRenameExam = async (e) => {
    e.preventDefault();
    if (!newExamName.trim() || !selectedExamId) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('Exam')
        .update({
          name: newExamName.trim(),
          updatedAt: Date.now()
        })
        .eq('id', parseInt(selectedExamId))
        .select()
        .single();

      if (error) throw error;
      setExams(exams.map(ex => ex.id === data.id ? data : ex));
      setNewExamName('');
      setShowExamModal(false);
    } catch (err) {
      console.error(err);
      alert('이름 수정 오류: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!selectedExamId) return;
    if (!window.confirm('정말로 이 시험지를 삭제하시겠습니까? 관련 모든 문제와 학생 이력이 영구 삭제됩니다.')) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('Exam')
        .delete()
        .eq('id', parseInt(selectedExamId));

      if (error) throw error;
      const updatedExams = exams.filter(ex => ex.id !== parseInt(selectedExamId));
      setExams(updatedExams);
      if (updatedExams.length > 0) {
        setSelectedExamId(updatedExams[0].id.toString());
      } else {
        setSelectedExamId('');
      }
    } catch (err) {
      console.error(err);
      alert('시험지 삭제 오류: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExamSettingsChange = async (fields) => {
    if (!selectedExamId) return;
    setIsSyncing(true);
    try {
      // Update remote db with standard fields
      const { data, error } = await supabase
        .from('Exam')
        .update({
          ...fields,
          updatedAt: Date.now()
        })
        .eq('id', parseInt(selectedExamId))
        .select()
        .single();

      if (error) throw error;

      setExams(exams.map(ex => ex.id === data.id ? data : ex));
    } catch (err) {
      console.error(err);
      alert('설정 반영 오류: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Question CRUD Operations
  const handleAddOption = () => {
    setQOptions([...qOptions, '']);
  };

  const handleRemoveOption = (indexToRemove) => {
    if (qOptions.length <= 2) {
      alert('객관식 문항은 최소 2개 이상의 선택지가 필요합니다.');
      return;
    }
    const updated = qOptions.filter((_, i) => i !== indexToRemove);
    setQOptions(updated);
    if (qCorrectIndex >= updated.length) {
      setQCorrectIndex(updated.length - 1);
    }
  };

  const handleOptionChange = (idx, val) => {
    const updated = [...qOptions];
    updated[idx] = val;
    setQOptions(updated);
  };

  const clearQuestionForm = () => {
    setEditingQuestionId(null);
    setQText('');
    setQCategory('데이터 분석');
    setQType('multiple-choice');
    setQOptions(['', '', '', '']);
    setQCorrectIndex(0);
    setQShortAnswers('');
    setQPlaceholder('');
    setQExplanation('');
    setQTimeLimit(120);
    setQReference('');
    setQAiduEnabled(false);
    
    // Set next qNumber
    if (questions && questions.length > 0) {
      setQNumber(Math.max(...questions.map(q => q.questionNumber)) + 1);
    } else {
      setQNumber(1);
    }
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!qText.trim()) {
      alert('질문 내용을 입력해주세요.');
      return;
    }

    setIsSyncing(true);
    const parsedShortAnswers = qShortAnswers
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== '');

    let refVal = qReference.trim();
    if (qAiduEnabled) {
      refVal = `<!--AIDU_MODE-->${refVal}`;
    }

    const record = {
      exam: parseInt(selectedExamId),
      questionNumber: qNumber,
      category: qCategory,
      questionText: qText.trim(),
      type: qType,
      explanation: qExplanation.trim(),
      timeLimit: qTimeLimit,
      reference: refVal || null
    };

    if (qType === 'multiple-choice') {
      // Filter out empty options
      const finalOptions = qOptions.filter(o => o.trim() !== '');
      if (finalOptions.length < 2) {
        alert('선택지를 최소 2개 입력해주세요.');
        setIsSyncing(false);
        return;
      }
      record.options = finalOptions;
      record.correctAnswerIndex = qCorrectIndex;
      record.correctAnswers = [];
      record.placeholder = null;
    } else {
      if (parsedShortAnswers.length === 0) {
        alert('주관식 정답을 최소 1개 이상 입력해주세요.');
        setIsSyncing(false);
        return;
      }
      record.options = [];
      record.correctAnswerIndex = null;
      record.correctAnswers = parsedShortAnswers;
      record.placeholder = qPlaceholder.trim() || null;
    }

    try {
      if (editingQuestionId) {
        // Update
        const { error } = await supabase
          .from('QuizQuestion')
          .update(record)
          .eq('id', editingQuestionId);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('QuizQuestion')
          .insert([record]);

        if (error) throw error;
      }

      // Sync exam updatedAt timestamp
      await supabase
        .from('Exam')
        .update({ updatedAt: Date.now() })
        .eq('id', parseInt(selectedExamId));

      clearQuestionForm();
      fetchQuestions(selectedExamId);
    } catch (err) {
      console.error(err);
      alert('문제 저장 실패: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEditQuestionClick = (q) => {
    setEditingQuestionId(q.id);
    setQNumber(q.questionNumber);
    setQText(q.questionText);
    setQCategory(q.category);
    setQType(q.type);
    setQExplanation(q.explanation || '');
    setQTimeLimit(q.timeLimit || 0);

    if (q.reference && (q.reference.includes('<!--AIDU_MODE-->') || q.reference.includes('[markdown]'))) {
      setQAiduEnabled(true);
      setQReference(q.reference.replace('<!--AIDU_MODE-->', ''));
    } else {
      setQAiduEnabled(false);
      setQReference(q.reference || '');
    }

    if (q.type === 'multiple-choice') {
      setQOptions(q.options || ['', '', '', '']);
      setQCorrectIndex(q.correctAnswerIndex || 0);
      setQShortAnswers('');
      setQPlaceholder('');
    } else {
      setQOptions(['', '', '', '']);
      setQCorrectIndex(0);
      setQShortAnswers(q.correctAnswers ? q.correctAnswers.join(', ') : '');
      setQPlaceholder(q.placeholder || '');
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm('문항을 삭제하시겠습니까?')) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('QuizQuestion')
        .delete()
        .eq('id', qId);

      if (error) throw error;

      // Sync exam updatedAt
      await supabase
        .from('Exam')
        .update({ updatedAt: Date.now() })
        .eq('id', parseInt(selectedExamId));

      fetchQuestions(selectedExamId);
      clearQuestionForm();
    } catch (err) {
      console.error(err);
      alert('문제 삭제 실패: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Student Attempt Operations
  const handleDeleteAttempt = async (attemptRecord) => {
    if (!window.confirm('해당 수험자와 모든 응시 기록을 삭제하시겠습니까?')) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('User')
        .delete()
        .eq('id', attemptRecord.user);

      if (error) throw error;
      fetchAttempts(selectedExamId);
    } catch (err) {
      console.error(err);
      alert('기록 삭제 실패: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleViewStudentResults = async (attemptRecord) => {
    setSelectedAttemptForView(attemptRecord);
    setIsAnswersLoading(true);
    try {
      const { data, error } = await supabase
        .from('UserAnswer')
        .select('*')
        .eq('attempt', attemptRecord.id);

      if (error) throw error;
      setStudentAnswers(data || []);
    } catch (err) {
      console.error(err);
      alert('답안 조회 실패: ' + err.message);
    } finally {
      setIsAnswersLoading(false);
    }
  };

  // Bulk Import/Export
  const handleExportJson = () => {
    if (questions.length === 0) {
      alert('내보낼 문항이 없습니다.');
      return;
    }
    const formatted = questions.map(q => ({
      category: q.category,
      questionText: q.questionText,
      type: q.type,
      options: q.options || [],
      correctAnswerIndex: q.correctAnswerIndex,
      correctAnswers: q.correctAnswers || [],
      placeholder: q.placeholder,
      explanation: q.explanation,
      timeLimit: q.timeLimit,
      reference: q.reference
    }));

    const blob = new Blob([JSON.stringify(formatted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const examName = exams.find(e => e.id === parseInt(selectedExamId))?.name || 'export';
    link.href = url;
    link.download = `${examName}_questions.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = 
      "Category,QuestionText,Type,Options(pipe-split),CorrectAnswers(pipe-split),CorrectAnswerIndex,Explanation,TimeLimit,Reference\n" +
      "\"데이터 분석\",\"회귀분석 설명으로 적절하지 않은 것은?\",\"multiple-choice\",\"설명력 지표는 R2 Score이다|종속변수는 범주형이다|독립변수가 여러 개면 다중회귀분석이다\",\"\",1,\"회귀분석의 종속변수는 수치 연속형입니다.\",120,\"\"\n" +
      "\"데이터 분석\",\"범주형 변수를 수치형 피처로 생성하는 변환 기법의 명칭은?\",\"short-answer\",\"\",\"원핫인코딩|원핫 인코딩|one-hot encoding\",,\"원핫 인코딩에 대한 설명입니다.\",120,\"\"";
      
    // UTF-8 BOM to prevent Excel encoding crash
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "sample_question_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSampleJson = () => {
    const sampleJson = [
      {
        category: "데이터 분석",
        questionText: "회귀분석 설명으로 적절하지 않은 것은?",
        type: "multiple-choice",
        options: [
          "설명력 지표는 R2 Score이다",
          "종속변수는 범주형이다",
          "독립변수가 여러 개면 다중회귀분석이다"
        ],
        correctAnswerIndex: 1,
        explanation: "회귀분석의 종속변수는 수치 연속형입니다.",
        timeLimit: 120,
        reference: null
      },
      {
        category: "데이터 분석",
        questionText: "범주형 변수를 수치형 피처로 생성하는 변환 기법의 명칭은?",
        type: "short-answer",
        correctAnswers: [
          "원핫인코딩",
          "원핫 인코딩",
          "one-hot encoding"
        ],
        explanation: "원핫 인코딩에 대한 설명입니다.",
        timeLimit: 120,
        reference: null
      }
    ];

    const blob = new Blob([JSON.stringify(sampleJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "sample_question_template.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    setImportMessage(null);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    processImportFile(files[0]);
  };

  const handleFileChange = (e) => {
    setImportMessage(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      processImportFile(files[0]);
    }
  };

  const processImportFile = (file) => {
    const reader = new FileReader();
    
    if (file.name.endsWith('.json')) {
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (!Array.isArray(imported)) {
            throw new Error('JSON 파일은 문제 정보들의 배열 구조여야 합니다.');
          }
          await insertBulkQuestions(imported);
        } catch (err) {
          setImportMessage({ type: 'danger', text: '오류: ' + err.message });
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.csv')) {
      reader.onload = async (event) => {
        try {
          const lines = event.target.result.split('\n');
          const imported = [];
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Simple split logic (for custom simple CSV parsing)
            // Format: Category,QuestionText,Type,Options(pipe-split),CorrectAnswers(pipe-split),CorrectAnswerIndex,Explanation,TimeLimit,Reference
            const cells = [];
            let inQuotes = false;
            let currentCell = '';
            
            for (let charIdx = 0; charIdx < line.length; charIdx++) {
              const char = line[charIdx];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                cells.push(currentCell.trim());
                currentCell = '';
              } else {
                currentCell += char;
              }
            }
            cells.push(currentCell.trim());

            if (cells.length < 3) continue;

            const category = cells[0] || '데이터 분석';
            const questionText = cells[1] || '';
            const type = cells[2] === 'short-answer' ? 'short-answer' : 'multiple-choice';
            const rawOptions = cells[3] ? cells[3].split('|') : [];
            const rawCorrectAnswers = cells[4] ? cells[4].split('|') : [];
            const corrIndex = cells[5] ? parseInt(cells[5]) : 0;
            const explanation = cells[6] || '';
            const timeLimit = cells[7] ? parseInt(cells[7]) : 120;
            const reference = cells[8] || null;

            imported.push({
              category,
              questionText,
              type,
              options: rawOptions.filter(o => o !== ''),
              correctAnswers: rawCorrectAnswers.filter(o => o !== ''),
              correctAnswerIndex: type === 'multiple-choice' ? corrIndex : null,
              explanation,
              timeLimit,
              reference
            });
          }
          
          await insertBulkQuestions(imported);
        } catch (err) {
          setImportMessage({ type: 'danger', text: 'CSV 파싱 실패: ' + err.message });
        }
      };
      reader.readAsText(file, 'utf-8');
    } else {
      setImportMessage({ type: 'danger', text: '지원되지 않는 파일 형식입니다. JSON 또는 CSV 확장자만 가능합니다.' });
    }
  };

  const insertBulkQuestions = async (importedList) => {
    setIsSyncing(true);
    try {
      let maxNumber = questions.length > 0 ? Math.max(...questions.map(q => q.questionNumber)) : 0;
      
      const records = importedList.map((q) => {
        maxNumber++;
        return {
          exam: parseInt(selectedExamId),
          questionNumber: maxNumber,
          category: q.category || '데이터 분석',
          questionText: q.questionText || '',
          type: q.type || 'multiple-choice',
          options: q.options || [],
          correctAnswerIndex: q.correctAnswerIndex !== undefined ? q.correctAnswerIndex : null,
          correctAnswers: q.correctAnswers || [],
          placeholder: q.placeholder || null,
          explanation: q.explanation || '',
          timeLimit: q.timeLimit || 120,
          reference: q.reference || null
        };
      });

      const { error } = await supabase
        .from('QuizQuestion')
        .insert(records);

      if (error) throw error;

      // Sync exam timestamp
      await supabase
        .from('Exam')
        .update({ updatedAt: Date.now() })
        .eq('id', parseInt(selectedExamId));

      setImportMessage({ type: 'success', text: `${records.length}개의 문항이 성공적으로 등록되었습니다.` });
      fetchQuestions(selectedExamId);
    } catch (err) {
      console.error(err);
      setImportMessage({ type: 'danger', text: '벌크 업로드 실패: ' + err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const activeExam = exams.find(e => e.id === parseInt(selectedExamId)) || null;

  return (
    <>
      <header>
        <div className="header-container">
          <div className="header-left">
            <button className="theme-btn" onClick={onExit} style={{ marginRight: '1rem', padding: '0.4rem' }}>
              <ArrowLeft size={16} />
            </button>
            <div className="logo-icon">A</div>
            <div className="logo-text">
              <h1>AICE Basic 모의고사</h1>
              <span>통합 관리자 모드</span>
            </div>
          </div>
          <div className="header-right">
            {activeExam && (
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                활성 시험지: {activeExam.name}
              </span>
            )}
            <button type="button" className="btn btn-secondary" onClick={onExit} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              관리자 종료
            </button>
          </div>
        </div>
      </header>

      <div className="main-layout" style={{ margin: '1.5rem auto' }}>
        {/* Left Form / Settings Section */}
        <section className="quiz-section">
          {/* Exam Manager & Time settings */}
          <div className="card admin-card">
            <div className="admin-card-title">시험지 및 설정 관리</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>시험지 선택</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select 
                    className="form-control" 
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    disabled={isLoading}
                  >
                    {exams.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    title="이름 수정"
                    style={{ padding: '0.5rem' }}
                    onClick={() => {
                      setExamModalMode('rename');
                      setNewExamName(activeExam?.name || '');
                      setShowExamModal(true);
                    }}
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    title="시험지 추가"
                    style={{ padding: '0.5rem' }}
                    onClick={() => {
                      setExamModalMode('create');
                      setNewExamName('');
                      setShowExamModal(true);
                    }}
                  >
                    <Plus size={16} />
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    title="시험지 삭제"
                    style={{ padding: '0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={handleDeleteExam}
                    disabled={exams.length <= 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {activeExam && (
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {/* Timer settings */}
                  <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 0 }}>
                    <label style={{ fontWeight: 'bold' }}>타이머 모드 설정</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        className="form-control"
                        value={activeExam.timeMode}
                        onChange={(e) => handleExamSettingsChange({ timeMode: e.target.value })}
                      >
                        <option value="total">전체 제한 시간</option>
                        <option value="per-question">문항별 제한 시간</option>
                        <option value="none">제한시간 없음</option>
                      </select>

                      {activeExam.timeMode === 'total' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <input
                            type="number"
                            className="form-control"
                            style={{ width: '80px' }}
                            value={activeExam.totalTimeLimit}
                            onChange={(e) => handleExamSettingsChange({ totalTimeLimit: parseInt(e.target.value) || 0 })}
                          />
                          <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>분</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AIDU Practice Mode Setting */}
                  <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>AIDU 실습 모드</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={activeExam.aiduEnabled || false}
                        onChange={(e) => handleExamSettingsChange({ aiduEnabled: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span style={{ fontSize: '0.9rem' }}>시험 내 AIDU 실습 기능 활성화</span>
                    </label>
                  </div>

                  {/* Exam-level CSV Upload */}
                  <div className="form-group" style={{ flex: '2 1 400px', marginBottom: 0 }}>
                    <label style={{ fontWeight: 'bold' }}>시험지 전체 공유용 CSV 데이터셋 설정 (택일)</label>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.75rem', 
                      marginTop: '0.25rem', 
                      padding: '0.75rem', 
                      backgroundColor: 'var(--card-bg, #ffffff)', 
                      borderRadius: 'var(--radius-sm, 6px)', 
                      border: '1px solid var(--border-color, #e2e8f0)' 
                    }}>
                      
                      {/* Method 1: Local File Upload */}
                      <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '0.35rem', color: 'var(--text-light)' }}>방법 1. 로컬 CSV 파일 직접 업로드</span>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <input 
                            type="file" 
                            id="exam-csv-file-input"
                            accept=".csv"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const arrayBuffer = evt.target.result;
                                let text;
                                try {
                                  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                                  text = utf8Decoder.decode(arrayBuffer);
                                } catch {
                                  try {
                                    const eucKrDecoder = new TextDecoder('euc-kr');
                                    text = eucKrDecoder.decode(arrayBuffer);
                                  } catch {
                                    alert('파일 인코딩 오류가 발생했습니다.');
                                    return;
                                  }
                                }
                                handleExamSettingsChange({
                                  csvData: text,
                                  csvFilename: file.name
                                });
                                setCsvUrlInput('');
                              };
                              reader.readAsArrayBuffer(file);
                            }}
                          />
                          <button 
                            type="button" 
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                            onClick={() => document.getElementById('exam-csv-file-input').click()}
                          >
                            <UploadCloud size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> CSV 파일 선택
                          </button>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', margin: '0.15rem 0' }}></div>

                      {/* Method 2: Google Drive / Web Publish Link */}
                      <div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '0.35rem', color: 'var(--text-light)' }}>방법 2. 구글 스프레드시트 / 드라이브 공유 링크 연동</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input 
                            type="text"
                            className="form-control"
                            style={{ fontSize: '0.8rem', padding: '0.4rem', flex: 1 }}
                            placeholder="구글 스프레드시트 [웹에 게시(CSV)] 링크 또는 공유 링크 입력"
                            value={csvUrlInput}
                            onChange={(e) => setCsvUrlInput(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap' }}
                            onClick={() => {
                              if (!csvUrlInput.trim()) {
                                alert('링크를 입력해 주세요.');
                                return;
                              }
                              if (!csvUrlInput.startsWith('http://') && !csvUrlInput.startsWith('https://')) {
                                alert('올바른 URL 형식이 아닙니다. http:// 또는 https://로 시작해야 합니다.');
                                return;
                              }
                              
                              let filename = 'google_drive_dataset.csv';
                              if (csvUrlInput.includes('spreadsheets')) {
                                filename = 'google_sheets_dataset.csv';
                              }

                              handleExamSettingsChange({
                                csvData: csvUrlInput.trim(),
                                csvFilename: filename
                              });
                            }}
                          >
                            링크 적용
                          </button>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                          ※ <b>팁:</b> 구글 드라이브 일반 공유 링크는 브라우저 보안(CORS) 제한으로 직접 로드되지 않을 수 있습니다. 구글 스프레드시트의 <b>[파일] &gt; [공유] &gt; [웹에 게시]</b> 기능을 사용하여 <b>'쉼표로 구분된 값(.csv)'</b>으로 게시된 URL을 입력하시는 것을 권장합니다.
                        </p>
                      </div>

                      {/* Active State */}
                      {activeExam.csvFilename && (
                        <div style={{ 
                          marginTop: '0.25rem', 
                          padding: '0.5rem 0.75rem', 
                          backgroundColor: 'var(--primary-light, #eff6ff)', 
                          border: '1px solid var(--primary, #3b82f6)', 
                          borderRadius: 'var(--radius-sm, 4px)',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          gap: '0.5rem', 
                          fontSize: '0.8rem' 
                        }}>
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary, #2563eb)' }}>적용 중: {activeExam.csvFilename}</span>
                            <span style={{ color: 'var(--text-light)', marginLeft: '0.5rem' }}>
                              {activeExam.csvData && (activeExam.csvData.startsWith('http') ? '(외부 링크)' : `(${(activeExam.csvData || '').split('\n').length - 1}행)`)}
                            </span>
                          </div>
                          <button 
                            type="button" 
                            className="btn-text-action" 
                            style={{ color: 'var(--danger, #dc2626)', fontSize: '0.8rem', fontWeight: 'bold', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                            onClick={() => {
                              if (confirm('정말로 첨부된 데이터셋 설정을 해제하시겠습니까?')) {
                                handleExamSettingsChange({
                                  csvData: null,
                                  csvFilename: null
                                });
                                setCsvUrlInput('');
                                const fileInput = document.getElementById('exam-csv-file-input');
                                if (fileInput) fileInput.value = '';
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs for CRUD vs Student attempts */}
          <div className="login-tabs" style={{ marginBottom: '0px' }}>
            <button
              className={`login-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
              onClick={() => setActiveTab('questions')}
            >
              문항 설계기 (CRUD)
            </button>
            <button
              className={`login-tab-btn ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              수험자 현황 및 모니터링 ({attempts.length})
            </button>
          </div>

          {activeTab === 'questions' ? (
            /* Question creation form card */
            <div className="card admin-card animate-fade-in" style={{ borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
              <div className="admin-card-title">
                {editingQuestionId ? `문항 수정 (#${qNumber})` : `신규 문항 추가 (#${qNumber})`}
              </div>

              <form onSubmit={handleSaveQuestion}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group">
                    <label>문항 번호</label>
                    <input
                      type="number"
                      className="form-control"
                      value={qNumber}
                      onChange={(e) => setQNumber(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="form-group">
                    <label>과목/카테고리</label>
                    <input
                      type="text"
                      className="form-control"
                      value={qCategory}
                      onChange={(e) => setQCategory(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>유형 선택</label>
                    <select
                      className="form-control"
                      value={qType}
                      onChange={(e) => setQType(e.target.value)}
                    >
                      <option value="multiple-choice">객관식 (MCQ)</option>
                      <option value="short-answer">주관식 단답형</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>질문 내용</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    placeholder="질문 내용을 입력하세요..."
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>지문 및 안내 (Context) - * simple markdown 지원</label>
                  <textarea
                    rows={4}
                    className="form-control"
                    placeholder="지문을 입력하세요 (예: 팁, 코드 블럭, 데이터셋 상세 정보...)"
                    value={qReference}
                    onChange={(e) => setQReference(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
                  <input
                    type="checkbox"
                    id="aidu-mode-toggle"
                    checked={qAiduEnabled}
                    onChange={(e) => setQAiduEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="aidu-mode-toggle" style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--primary, #0052cc)' }}>
                    AIDU 실습 모드 활성화 (해당 문제 풀이 시 우측에 데이터 가공/시각화 시뮬레이터 노출)
                  </label>
                </div>

                {/* MCQ details */}
                {qType === 'multiple-choice' ? (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ margin: 0 }}>선택지 목록 (최소 2개)</label>
                      <button type="button" className="btn-text-action" onClick={handleAddOption}>
                        + 선택지 추가
                      </button>
                    </div>
                    
                    <div className="options-input-list">
                      {qOptions.map((opt, idx) => (
                        <div key={idx} className="option-input-row">
                          <input
                            type="radio"
                            name="correct_index"
                            checked={qCorrectIndex === idx}
                            onChange={() => setQCorrectIndex(idx)}
                            style={{ width: '18px', height: '18px' }}
                          />
                          <input
                            type="text"
                            className="form-control"
                            placeholder={`선택지 ${idx + 1}`}
                            value={opt}
                            onChange={(e) => handleOptionChange(idx, e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-icon-delete"
                            onClick={() => handleRemoveOption(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Short answer details */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                    <div className="form-group">
                      <label>정답 조건 목록 (쉼표 구분)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="예: 원핫 인코딩, 원핫인코딩, one-hot encoding"
                        value={qShortAnswers}
                        onChange={(e) => setQShortAnswers(e.target.value)}
                      />
                      <span className="field-desc">다양한 띄어쓰기, 기호, 영문 오타 등 허용 답안들을 쉼표로 나열하세요.</span>
                    </div>
                    <div className="form-group">
                      <label>단답형 입력란 안내(Placeholder)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="예: 영문 또는 한글 작성"
                        value={qPlaceholder}
                        onChange={(e) => setQPlaceholder(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  {activeExam?.timeMode === 'per-question' && (
                    <div className="form-group">
                      <label>개별 제한 시간 (초)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={qTimeLimit}
                        onChange={(e) => setQTimeLimit(parseInt(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ gridColumn: activeExam?.timeMode === 'per-question' ? 'auto' : 'span 3' }}>
                    <label>문제 설명 및 해설</label>
                    <textarea
                      rows={2}
                      className="form-control"
                      placeholder="풀이 해설을 기입하세요..."
                      value={qExplanation}
                      onChange={(e) => setQExplanation(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={clearQuestionForm}>
                    초기화
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSyncing}>
                    {isSyncing ? '저장 중...' : '문항 저장'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Student list card */
            <div className="card admin-card animate-fade-in" style={{ borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div className="admin-card-title" style={{ margin: 0, border: 'none', padding: 0 }}>수험 기록 모니터링</div>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.8rem' }}
                  onClick={() => fetchAttempts(selectedExamId)}
                >
                  <RefreshCw size={14} /> 목록 새로고침
                </button>
              </div>

              <div className="admin-table-container" style={{ maxHeight: '500px' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>수험자</th>
                      <th>시작 시간</th>
                      <th>상태</th>
                      <th>정답 수 / 총 문항</th>
                      <th>점수</th>
                      <th style={{ textAlign: 'center' }}>조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                          이 시험에 응시한 학생 기록이 존재하지 않습니다.
                        </td>
                      </tr>
                    ) : (
                      attempts.map(att => {
                        const isFinished = !!att.completedAt;
                        const dateStr = new Date(att.startedAt).toLocaleString();
                        
                        return (
                          <tr key={att.id}>
                            <td style={{ fontWeight: 'bold' }}>{att.User?.displayName || '알 수 없음'}</td>
                            <td>{dateStr}</td>
                            <td>
                              <span className={`result-badge ${isFinished ? 'pass' : 'fail'}`} style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', margin: 0 }}>
                                {isFinished ? '제출 완료' : '응시 중'}
                              </span>
                            </td>
                            <td>{isFinished ? `${att.correctAnswersCount} / ${att.totalQuestions}` : '-'}</td>
                            <td style={{ fontWeight: '800', color: isFinished ? (att.score >= 60 ? 'var(--success)' : 'var(--danger)') : 'inherit' }}>
                              {isFinished ? `${att.score}점` : '-'}
                            </td>
                            <td>
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="btn-table btn-table-edit"
                                  onClick={() => handleViewStudentResults(att)}
                                  disabled={!isFinished}
                                >
                                  <Eye size={12} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> 결과 보기
                                </button>
                                <button
                                  type="button"
                                  className="btn-table btn-table-delete"
                                  onClick={() => handleDeleteAttempt(att)}
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Right Side Sidebar (Bulk control, Question list summary) */}
        <section className="sidebar">
          {/* Dropzone for bulk actions */}
          <div className="sidebar-card">
            <div className="sidebar-title">벌크 문제 가져오기 / 내보내기</div>
            
            <div 
              className={`dropzone-area ${isDragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <UploadCloud size={32} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
              <p style={{ fontWeight: 'bold' }}>JSON / CSV 파일을 여기에 놓으세요</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>또는 컴퓨터에서 직접 찾으려면 클릭</p>
              <input 
                type="file" 
                accept=".json,.csv" 
                style={{ display: 'none' }} 
                id="file-upload-input" 
                onChange={handleFileChange}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', marginTop: '0.75rem' }}
                onClick={() => document.getElementById('file-upload-input').click()}
              >
                파일 선택
              </button>
            </div>

            {importMessage && (
              <div style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                backgroundColor: importMessage.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                color: importMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
                marginBottom: '1rem',
                fontWeight: '600'
              }}>
                {importMessage.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-full"
                style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                onClick={handleDownloadSampleCsv}
              >
                <Download size={12} /> 샘플 CSV 다운로드
              </button>
              <button 
                type="button" 
                className="btn btn-secondary btn-full"
                style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                onClick={handleDownloadSampleJson}
              >
                <Download size={12} /> 샘플 JSON 다운로드
              </button>
            </div>

            <button 
              type="button" 
              className="btn btn-secondary btn-full"
              onClick={handleExportJson}
            >
              <Download size={14} /> 문항 내보내기 (JSON)
            </button>
          </div>

          {/* Collapsible Questions List */}
          <div className="sidebar-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="sidebar-title">
              <span>설계된 문항 ({questions.length})</span>
            </div>

            <div className="admin-table-container" style={{ flex: 1, overflowY: 'auto' }}>
              <table className="admin-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>질문 요약</th>
                    <th>조치</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)' }}>
                        문제가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    questions.map(q => (
                      <tr key={q.id} style={{ backgroundColor: editingQuestionId === q.id ? 'var(--primary-light)' : 'inherit' }}>
                        <td>{q.questionNumber}</td>
                        <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.questionText}>
                          {q.questionText}
                          {(q.reference?.includes('<!--AIDU_MODE-->') || q.reference?.includes('[markdown]')) && (
                            <span style={{ 
                              marginLeft: '0.4rem', 
                              backgroundColor: '#deebff', 
                              color: '#0747a6', 
                              fontSize: '0.62rem', 
                              padding: '1px 4px', 
                              borderRadius: '3px',
                              fontWeight: 'bold'
                            }}>
                              AIDU
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button 
                              type="button" 
                              className="btn-table btn-table-edit" 
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                              onClick={() => handleEditQuestionClick(q)}
                            >
                              수정
                            </button>
                            <button 
                              type="button" 
                              className="btn-table btn-table-delete" 
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                              onClick={() => handleDeleteQuestion(q.id)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Exam Create/Rename Dialog Modal */}
      {showExamModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <h3 className="modal-title">
              {examModalMode === 'create' ? '새 시험지 추가' : '시험지 이름 변경'}
            </h3>
            
            <form onSubmit={examModalMode === 'create' ? handleCreateExam : handleRenameExam}>
              <div className="form-group" style={{ textAlign: 'left', marginTop: '1rem' }}>
                <label>시험지 제목</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="예: AICE Basic 2회차 모의고사"
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExamModal(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSyncing}>
                  {isSyncing ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Student Answer Sheet Modal */}
      {selectedAttemptForView && (
        <div className="modal-overlay show" style={{ zIndex: 300 }}>
          <div className="modal" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 className="modal-title" style={{ margin: 0 }}>
                {selectedAttemptForView.User?.displayName} 학생의 상세 답안지
              </h3>
              <button 
                type="button" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setSelectedAttemptForView(null)}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
              {isAnswersLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <RefreshCw className="animate-spin" size={32} />
                  <p style={{ marginTop: '0.5rem' }}>답안 이력을 로드하는 중입니다...</p>
                </div>
              ) : (
                <div className="review-list">
                  {questions.map((q) => {
                    const uAns = studentAnswers.find(sa => sa.question === q.id);
                    const isCorrect = uAns ? uAns.isCorrect : false;

                    let uText = '미입력';
                    let cText;

                    if (q.type === 'multiple-choice') {
                      if (uAns && uAns.userSelectedAnswer !== undefined && uAns.userSelectedAnswer !== '') {
                        const cellIdx = parseInt(uAns.userSelectedAnswer);
                        uText = `${cellIdx + 1}. ${q.options[cellIdx] || ''}`;
                      }
                      cText = `${q.correctAnswerIndex + 1}. ${q.options[q.correctAnswerIndex] || ''}`;
                    } else {
                      if (uAns && uAns.userSelectedAnswer) {
                        uText = uAns.userSelectedAnswer;
                      }
                      cText = q.correctAnswers.join(' / ');
                    }

                    return (
                      <div key={q.id} className="review-item expanded" style={{ marginBottom: '1rem' }}>
                        <div className="review-item-header" style={{ cursor: 'default' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className={`review-status-indicator ${isCorrect ? 'correct' : 'incorrect'}`}>
                              {isCorrect ? '✓' : '✗'}
                            </div>
                            <span className="review-question-txt">
                              Q{q.questionNumber}. {q.questionText}
                            </span>
                          </div>
                        </div>
                        <div className="review-item-body" style={{ display: 'block', padding: '1rem 1.5rem' }}>
                          <div className="answer-comparison-box" style={{ margin: 0 }}>
                            <div className={`compare-card user ${isCorrect ? 'correct' : ''}`}>
                              <div className="compare-title">제출한 답안</div>
                              <div className="compare-val">{uText}</div>
                              <div className="compare-title" style={{ marginTop: '0.5rem' }}>소요 시간</div>
                              <div className="compare-val" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{uAns?.timeTaken ? `${uAns.timeTaken}초` : '-'}</div>
                            </div>
                            <div className="compare-card correct-ans">
                              <div className="compare-title">정답 기준</div>
                              <div className="compare-val">{cText}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => setSelectedAttemptForView(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
