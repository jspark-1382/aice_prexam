import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Clock, ChevronLeft, ChevronRight, Send, AlertCircle, HelpCircle, UploadCloud, Home, Database, Brain, Cpu, Settings, BarChart2, Trash2 } from 'lucide-react';
import AiduColumnCard from './AiduColumnCard';

export default function ExamPanel({ 
  attempt, 
  user,
  questions, 
  initialAnswers, 
  onExamSubmit, 
  onLogout 
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: answerString }
  const [timeTakenMap, setTimeTakenMap] = useState({}); // { [questionId]: seconds }
  
  // Timer States
  const [timeLeft, setTimeLeft] = useState(attempt.timeLeft || 0); // Global timer in seconds
  const [timeLeftMap, setTimeLeftMap] = useState({}); // { [questionId]: seconds }
  
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('실시간 저장 중...');
  
  // AIDU Platform Simulator States
  const [isCsvLoading, setIsCsvLoading] = useState(false);
  const [csvLoadError, setCsvLoadError] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState({}); // { [filename]: { headers, rows } }
  const [activeFilename, setActiveFilename] = useState('');
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [aiduTab, setAiduTab] = useState('import'); // 'import' | 'describe' | 'sample'
  const [dataRangeStart, setDataRangeStart] = useState(0);
  const [dataRangeEnd, setDataRangeEnd] = useState(0);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [dataAnalysisExpanded, setDataAnalysisExpanded] = useState(true);

  // Visualization States
  const [vizType, setVizType] = useState('heatmap'); // 'heatmap' | 'scatter' | 'boxplot' | 'distribution' | 'wordcloud'
  const [vizRenderState, setVizRenderState] = useState(null);
  const [hueColumn, setHueColumn] = useState('');
  const [activeChart, setActiveChart] = useState('none');
  const [boxplotY, setBoxplotY] = useState('');
  const [boxplotX, setBoxplotX] = useState('');
  const [distributionX, setDistributionX] = useState('');
  const [hoveredBin, setHoveredBin] = useState(null);


  // Preprocessing States
  const [preprocessDropNa, setPreprocessDropNa] = useState(false);
  const [preprocessOneHot, setPreprocessOneHot] = useState(false);
  const [preprocessScale, setPreprocessScale] = useState(false);
  const [preprocessStatus, setPreprocessStatus] = useState('');
  const [preprocessSelectedCol, setPreprocessSelectedCol] = useState('');
  const [preprocessPreviewState, setPreprocessPreviewState] = useState(null);
  const [preprocessToast, setPreprocessToast] = useState({ show: false, message1: '', message2: '' });

  // Center panel tool options
  const [prepImputerTool, setPrepImputerTool] = useState('basic_imputer');
  const [prepImputerStrategy, setPrepImputerStrategy] = useState('most_frequent');
  const [prepScaleTool, setPrepScaleTool] = useState('basic_scaler');
  const [prepScaleStrategy, setPrepScaleStrategy] = useState('Min-Max Scaler');
  const [prepTransTool, setPrepTransTool] = useState('');
  const [prepTransStrategy, setPrepTransStrategy] = useState('uniform');
  const [prepNQuantiles, setPrepNQuantiles] = useState(10);
  const [prepFilterTool, setPrepFilterTool] = useState('missing_filter');
  const [prepRegexTool, setPrepRegexTool] = useState('Regex');
  const [prepRegexPattern, setPrepRegexPattern] = useState('(.*)');
  const [prepNlpTool, setPrepNlpTool] = useState('pecab');
  const [prepNlpStrategy, setPrepNlpStrategy] = useState('형태소 분석');

  // Preprocessing Column Selection Auto-Sync
  useEffect(() => {
    if (activeFilename && uploadedFiles[activeFilename]) {
      const { headers } = uploadedFiles[activeFilename];
      if (headers && headers.length > 0 && !headers.includes(preprocessSelectedCol)) {
        setPreprocessSelectedCol(headers[0]);
        setPreprocessPreviewState(null);
      }
    } else {
      setPreprocessSelectedCol('');
      setPreprocessPreviewState(null);
    }
  }, [activeFilename, uploadedFiles]);

  // AI Training States
  const [modelTarget, setModelTarget] = useState('');
  const [modelFeatures, setModelFeatures] = useState([]);
  const [modelType, setModelType] = useState('linear'); // 'linear' | 'tree'
  const [trainedModel, setTrainedModel] = useState(null);
  const [isTraining, setIsTraining] = useState(false);

  // ML Training Workspace States
  const [mlOutputCol, setMlOutputCol] = useState('');
  const [mlInputCols, setMlInputCols] = useState([]);
  const [mlExcludeCols, setMlExcludeCols] = useState([]);
  const [mlSelectedColInInput, setMlSelectedColInInput] = useState('');
  const [mlSelectedColInOutput, setMlSelectedColInOutput] = useState('');
  const [mlSelectedColInExclude, setMlSelectedColInExclude] = useState('');
  
  const [mlDataType, setMlDataType] = useState('Numeric');
  const [mlModelType, setMlModelType] = useState('Classification');
  const [mlOutlierHandling, setMlOutlierHandling] = useState('포함');
  const [mlSelectedModels, setMlSelectedModels] = useState([]);
  const [mlTrainRatio, setMlTrainRatio] = useState(0.7);
  const [mlCvType, setMlCvType] = useState('stratifiedkfold');
  const [mlCvFolds, setMlCvFolds] = useState(10);
  const [mlImbalanceHandling, setMlImbalanceHandling] = useState('없음');
  const [mlSortMetric, setMlSortMetric] = useState('Accuracy');
  const [mlCvEnabled, setMlCvEnabled] = useState('true');
  
  const [mlTrainResults, setMlTrainResults] = useState(null);
  const [mlToastShow, setMlToastShow] = useState(false);
  const [mlIsTraining, setMlIsTraining] = useState(false);

  // Sync columns list on file activation
  useEffect(() => {
    if (activeFilename && uploadedFiles[activeFilename]) {
      const { headers } = uploadedFiles[activeFilename];
      setMlInputCols([...headers]);
      setMlOutputCol('');
      setMlExcludeCols([]);
      setMlSelectedColInInput('');
      setMlSelectedColInOutput('');
      setMlSelectedColInExclude('');
      setMlTrainResults(null);
      setMlSelectedModels([]);
    } else {
      setMlInputCols([]);
      setMlOutputCol('');
      setMlExcludeCols([]);
      setMlSelectedColInInput('');
      setMlSelectedColInOutput('');
      setMlSelectedColInExclude('');
      setMlTrainResults(null);
      setMlSelectedModels([]);
    }
  }, [activeFilename]);

  // AI Prediction States
  const [predictInputs, setPredictInputs] = useState({});
  const [predictionResult, setPredictionResult] = useState(null);

  // Auto-sync intervals reference
  const syncTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const activeQuestion = questions[currentIdx] || null;
  const hasAiduData = !!attempt.Exam?.aiduEnabled && !!attempt.Exam?.csvData;

  // Initialize answers from props
  useEffect(() => {
    const ansObj = {};
    const timeTakenObj = {};
    if (initialAnswers && initialAnswers.length > 0) {
      initialAnswers.forEach(ans => {
        ansObj[ans.question] = ans.userSelectedAnswer;
        timeTakenObj[ans.question] = ans.timeTaken || 0;
      });
    }

    let parsed = null;
    if (attempt.timeLeftMapJson) {
      try {
        parsed = JSON.parse(attempt.timeLeftMapJson);
      } catch (e) {
        console.error('Error parsing timeLeftMapJson:', e);
      }
    }

    setTimeout(() => {
      setAnswers(ansObj);
      setTimeTakenMap(timeTakenObj);
      if (parsed) {
        setTimeLeftMap(parsed);
      }
    }, 0);
  }, [initialAnswers, attempt]);

  // Main countdown timer
  useEffect(() => {
    countdownTimerRef.current = setInterval(() => {
      // 1. Total Time Limit Mode
      if (attempt.Exam?.timeMode === 'total') {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      } 
      // 2. Per-Question Time Limit Mode
      else if (attempt.Exam?.timeMode === 'per-question' && activeQuestion) {
        const qId = activeQuestion.id;
        const qLimit = activeQuestion.timeLimit || 120; // default 2 mins if 0
        
        setTimeLeftMap(prevMap => {
          const currentRemaining = prevMap[qId] !== undefined ? prevMap[qId] : qLimit;
          
          if (currentRemaining <= 1) {
            // Time is up for this question! Go to next question
            const updated = { ...prevMap, [qId]: 0 };
            setTimeout(() => {
              goToNextQuestion();
            }, 100);
            return updated;
          }
          return { ...prevMap, [qId]: currentRemaining - 1 };
        });
      }

      // Track time spent on the active question
      if (activeQuestion) {
        setTimeTakenMap(prev => ({
          ...prev,
          [activeQuestion.id]: (prev[activeQuestion.id] || 0) + 1
        }));
      }
    }, 1000);

    return () => clearInterval(countdownTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, activeQuestion]);

  // Periodically save progress to Supabase (every 10 seconds)
  useEffect(() => {
    syncTimerRef.current = setInterval(() => {
      saveProgressToDb();
    }, 10000);

    return () => {
      clearInterval(syncTimerRef.current);
      // Final save when component unmounts
      saveProgressToDb();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, timeLeft, timeLeftMap, timeTakenMap]);

  // Preload CSV dataset if present on Exam
  useEffect(() => {
    if (!attempt.Exam) return;

    let rawCsvData = attempt.Exam.csvData;
    let filename = attempt.Exam.csvFilename;

    const examName = attempt.Exam.name || '';
    
    // Force map standard exams to local public CSVs ONLY IF no custom csvData is configured by the admin
    if (!rawCsvData) {
      if (examName.includes('무선품질') || examName.includes('속도')) {
        rawCsvData = '/속도_불량예측_utf8_분류.CSV';
        filename = '속도_불량예측_utf8_분류.CSV';
      } else if (examName.includes('전력') || examName.includes('기본') || examName.includes('모의고사')) {
        rawCsvData = '/기지국전력량예측_회귀.csv';
        filename = '기지국전력량예측_회귀.csv';
      }
    }

    if (!rawCsvData) return;
    if (!filename) filename = 'exam_data.csv';

    if (uploadedFiles[filename]) return; // already loaded

    const isUrl = rawCsvData.startsWith('http://') || rawCsvData.startsWith('https://') || rawCsvData.startsWith('/');

    const applyParsed = (parsed) => {
      if (!parsed || parsed.headers.length === 0) {
        console.warn('CSV 파싱 결과가 비어있습니다. 데이터를 확인해 주세요.');
        return;
      }
      setUploadedFiles(prev => ({ ...prev, [filename]: parsed }));
      setActiveFilename(filename);
      setSelectedColumns([...parsed.headers]);
      const N = parsed.rows.length;
      setDataRangeStart(0);
      setDataRangeEnd(N);
      setVizRenderState({ type: 'heatmap', columns: [...parsed.headers], rangeEnd: N });
      setAnalysisResults(null);
      setAiduTab('describe');
    };

    if (isUrl) {
      const fetchUrl = getDirectDownloadUrl(rawCsvData);

      fetch(fetchUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.text();
        })
        .then(text => {
          const parsed = parseCsvData(text);
          applyParsed(parsed);
        })
        .catch(err => {
          console.error('외부 CSV 로드 실패:', err);
          if (fetchUrl.startsWith('http')) {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fetchUrl)}`;
            return fetch(proxyUrl)
              .then(res => res.text())
              .then(text => {
                const parsed = parseCsvData(text);
                applyParsed(parsed);
              })
              .catch(proxyErr => {
                console.error('CORS 프록시로도 로드 실패:', proxyErr);
                alert(`데이터 로드 실패: ${err.message}\n\n구글 시트의 경우 [파일 > 공유 > 웹에 게시 > CSV]로 게시된 URL을 사용해 주세요.`);
              });
          } else {
            console.error('로컬 리소스 로드 실패:', err);
          }
        });
    } else {
      const parsed = parseCsvData(rawCsvData);
      setTimeout(() => applyParsed(parsed), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Auto-save answers when user selects/inputs an answer
  const handleAnswerChange = async (questionId, value) => {
    // If per-question timer is up for this question, lock it
    const isLocked = isQuestionLocked(questionId);
    if (isLocked) return;

    const updatedAnswers = { ...answers, [questionId]: value };
    setAnswers(updatedAnswers);

    // Save this single answer immediately to Supabase
    setSyncStatus('저장 중...');
    try {
      // Verify correct
      const q = questions.find(item => item.id === questionId);
      const isCorrect = checkAnswerCorrectness(q, value);

      // Check if UserAnswer row already exists
      const { data: existing, error: queryError } = await supabase
        .from('UserAnswer')
        .select('id')
        .eq('attempt', attempt.id)
        .eq('question', questionId);

      if (queryError) throw queryError;

      if (existing && existing.length > 0) {
        // Update
        const { error: updateError } = await supabase
          .from('UserAnswer')
          .update({
            userSelectedAnswer: value,
            isCorrect: isCorrect,
            timeTaken: timeTakenMap[questionId] || 0
          })
          .eq('id', existing[0].id);

        if (updateError) throw updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('UserAnswer')
          .insert([{
            attempt: attempt.id,
            question: questionId,
            userSelectedAnswer: value,
            isCorrect: isCorrect,
            timeTaken: timeTakenMap[questionId] || 0
          }]);

        if (insertError) throw insertError;
      }
      setSyncStatus('실시간 동기화 완료');
    } catch (e) {
      console.error('Auto-save answer error:', e);
      setSyncStatus('저장 실패 (재시도 중)');
    }
  };

  const checkAnswerCorrectness = (questionObj, val) => {
    if (!questionObj || val === undefined || val === '') return false;
    
    if (questionObj.type === 'multiple-choice') {
      return parseInt(val) === questionObj.correctAnswerIndex;
    } else if (questionObj.type === 'short-answer') {
      const sanitizedUser = val.replace(/\s+/g, '').toLowerCase();
      // correctAnswers is text[]
      return questionObj.correctAnswers.some(ans => 
        ans.replace(/\s+/g, '').toLowerCase() === sanitizedUser
      );
    }
    return false;
  };

  const isQuestionLocked = (qId) => {
    if (attempt.Exam?.timeMode !== 'per-question') return false;
    return timeLeftMap[qId] === 0;
  };

  async function saveProgressToDb() {
    try {
      const updateData = {};
      if (attempt.Exam?.timeMode === 'total') {
        updateData.timeLeft = timeLeft;
      } else if (attempt.Exam?.timeMode === 'per-question') {
        updateData.timeLeftMapJson = JSON.stringify(timeLeftMap);
      }

      const { error } = await supabase
        .from('QuizAttempt')
        .update(updateData)
        .eq('id', attempt.id);

      if (error) throw error;
      setSyncStatus('실시간 동기화 완료');
    } catch (e) {
      console.error('Periodic sync error:', e);
    }
  }

  function handleAutoSubmit() {
    setSyncStatus('제한시간 종료. 제출 중...');
    submitExamFinal();
  }

  const handleSubmitClick = () => {
    setShowSubmitModal(true);
  };

  async function submitExamFinal() {
    setShowSubmitModal(false);
    clearInterval(countdownTimerRef.current);
    clearInterval(syncTimerRef.current);

    setSyncStatus('성적 처리 중...');

    try {
      // 1. Fetch final answers from Supabase to guarantee correctness
      const { data: finalAnswers, error: ansError } = await supabase
        .from('UserAnswer')
        .select('*')
        .eq('attempt', attempt.id);

      if (ansError) throw ansError;

      // 2. Grade the attempt
      let correctCount = 0;
      const totalQuestionsCount = questions.length;

      questions.forEach(q => {
        const userAns = finalAnswers?.find(fa => fa.question === q.id);
        if (userAns && userAns.isCorrect) {
          correctCount++;
        }
      });

      const finalScore = Math.round((correctCount / totalQuestionsCount) * 100);

      // 3. Update QuizAttempt as completed
      const { error: attemptError } = await supabase
        .from('QuizAttempt')
        .update({
          completedAt: new Date().toISOString(),
          score: finalScore,
          totalQuestions: totalQuestionsCount,
          correctAnswersCount: correctCount,
          timeLeft: attempt.Exam?.timeMode === 'total' ? timeLeft : null,
          timeLeftMapJson: attempt.Exam?.timeMode === 'per-question' ? JSON.stringify(timeLeftMap) : null
        })
        .eq('id', attempt.id);

      if (attemptError) throw attemptError;

      setSyncStatus('제출 성공');
      
      // Notify parent
      onExamSubmit(finalScore, correctCount, totalQuestionsCount);
    } catch (e) {
      console.error('Submit exam error:', e);
      alert('제출 처리 중 오류가 발생했습니다: ' + e.message);
    }
  }

  function goToNextQuestion() {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  }

  function goToPrevQuestion() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  }

  const handleAutoFillCorrectAnswers = async () => {
    if (!window.confirm('모든 문항의 정답을 자동으로 입력하시겠습니까? (테스트용)')) return;
    
    setSyncStatus('정답 자동 입력 중...');
    const updatedAnswers = { ...answers };
    
    try {
      for (const q of questions) {
        let correctValue = '';
        if (q.type === 'multiple-choice') {
          correctValue = q.correctAnswerIndex !== null ? q.correctAnswerIndex.toString() : '';
        } else {
          correctValue = q.correctAnswers && q.correctAnswers.length > 0 ? q.correctAnswers[0] : '';
        }
        
        updatedAnswers[q.id] = correctValue;
        
        // Save to DB
        const isCorrect = true;
        const { data: existing, error: queryError } = await supabase
          .from('UserAnswer')
          .select('id')
          .eq('attempt', attempt.id)
          .eq('question', q.id);

        if (queryError) throw queryError;

        if (existing && existing.length > 0) {
          const { error: updateError } = await supabase
            .from('UserAnswer')
            .update({
              userSelectedAnswer: correctValue,
              isCorrect: isCorrect,
              timeTaken: timeTakenMap[q.id] || 0
            })
            .eq('id', existing[0].id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('UserAnswer')
            .insert([{
              attempt: attempt.id,
              question: q.id,
              userSelectedAnswer: correctValue,
              isCorrect: isCorrect,
              timeTaken: 0
            }]);
          if (insertError) throw insertError;
        }
      }
      
      setAnswers(updatedAnswers);
      setSyncStatus('정답 입력 완료');
      alert('모든 정답이 자동으로 입력되었습니다.');
    } catch (e) {
      console.error(e);
      alert('정답 입력 중 오류 발생: ' + e.message);
    }
  };

  // Mini custom markdown renderer
  const renderContext = (text) => {
    if (!text) return null;
    const cleanText = text.replace('<!--AIDU_MODE-->', '').replace('[markdown]', '');
    if (!cleanText.trim()) return null;
    
    const lines = cleanText.split('\n');
    return (
      <div className="markdown-desc-box">
        {lines.map((line, i) => {
          // Check for bullet points
          const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-');
          const cleanLine = isBullet ? line.trim().substring(1).trim() : line;
          
          // Render inline code backticks `code`
          const parts = cleanLine.split(/(`[^`]+`)/g);
          const parsedContent = parts.map((part, idx) => {
            if (part.startsWith('`') && part.endsWith('`')) {
              return <code key={idx}>{part.slice(1, -1)}</code>;
            }
            return part;
          });

          if (isBullet) {
            return (
              <div key={i} className="md-item">
                {parsedContent}
              </div>
            );
          } else {
            return (
              <p key={i} className="md-para">
                {parsedContent}
              </p>
            );
          }
        })}
      </div>
    );
  };

  // Calculate progress stats
  const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== '').length;
  const progressPercent = (answeredCount / questions.length) * 100;

  // Format timer text
  const formatTime = (secs) => {
    if (secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Active question timer details
  const getQuestionTimerInfo = () => {
    if (!activeQuestion) return { label: '', time: 0, percent: 100, isWarning: false };
    
    const limit = activeQuestion.timeLimit || 120;
    const remaining = timeLeftMap[activeQuestion.id] !== undefined ? timeLeftMap[activeQuestion.id] : limit;
    const pct = (remaining / limit) * 100;
    
    return {
      label: `문항 ${activeQuestion.questionNumber} 타이머`,
      time: formatTime(remaining),
      percent: pct,
      isWarning: remaining <= 20
    };
  };

  const getGlobalTimerInfo = () => {
    const limit = (attempt.Exam?.totalTimeLimit || 30) * 60;
    const pct = (timeLeft / limit) * 100;
    return {
      label: '시험 잔여 시간',
      time: formatTime(timeLeft),
      percent: pct,
      isWarning: timeLeft <= 180 // 3 minutes warning
    };
  };

  const timerInfo = attempt.Exam?.timeMode === 'per-question' ? getQuestionTimerInfo() : getGlobalTimerInfo();
  const activeLocked = activeQuestion ? isQuestionLocked(activeQuestion.id) : false;

  // ==========================================
  // AIDU Platform Simulation Functions
  // ==========================================
  const getDirectDownloadUrl = (url) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.includes('docs.google.com/spreadsheets')) {
      if (trimmed.includes('/pub')) {
        if (!trimmed.includes('output=csv')) {
          return trimmed.includes('?') ? `${trimmed}&output=csv` : `${trimmed}?output=csv`;
        }
        return trimmed;
      }
      const sheetIdMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (sheetIdMatch && sheetIdMatch[1]) {
        return `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/pub?output=csv`;
      }
    }
    const fileDRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match1 = trimmed.match(fileDRegex);
    if (match1 && match1[1]) {
      return `https://docs.google.com/uc?export=download&id=${match1[1]}`;
    }
    const idRegex = /[?&]id=([a-zA-Z0-9_-]+)/;
    const match2 = trimmed.match(idRegex);
    if (match2 && match2[1]) {
      return `https://docs.google.com/uc?export=download&id=${match2[1]}`;
    }
    return trimmed;
  };

  const computeColumnTypes = (headers, rows) => {
    const colTypes = {};
    headers.forEach(col => {
      const values = rows.map(r => r[col]);
      const nonBlankVals = values.filter(v => v !== null && v !== undefined && v !== '');
      if (nonBlankVals.length === 0) {
        colTypes[col] = 'object';
        return;
      }
      const numericValues = nonBlankVals.map(Number).filter(v => !isNaN(v));
      if (numericValues.length / nonBlankVals.length >= 0.9) {
        const hasDecimal = numericValues.some(v => !Number.isInteger(v)) || nonBlankVals.some(v => String(v).includes('.'));
        colTypes[col] = hasDecimal ? 'float64' : 'int64';
      } else {
        colTypes[col] = 'object';
      }
    });
    return colTypes;
  };

  const parseCsvData = (text) => {
    if (!text) return { headers: [], rows: [], types: {} };
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      console.warn('Invalid CSV data structure (received HTML/JSON). Parsing aborted.');
      return { headers: [], rows: [], types: {} };
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      const nextC = text[i + 1];
      
      if (inQuotes) {
        if (c === '"') {
          if (nextC === '"') {
            currentCell += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentCell += c;
          i++;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
        } else if (c === ',') {
          currentRow.push(currentCell.trim());
          currentCell = '';
          i++;
        } else if (c === '\r' || c === '\n') {
          currentRow.push(currentCell.trim());
          currentCell = '';
          
          if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          
          if (c === '\r' && nextC === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else {
          currentCell += c;
          i++;
        }
      }
    }
    
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
        rows.push(currentRow);
      }
    }
    
    if (rows.length === 0) return { headers: [], rows: [], types: {} };
    
    const headers = rows[0];
    const dataRows = [];
    
    for (let r = 1; r < rows.length; r++) {
      const rowData = {};
      headers.forEach((h, idx) => {
        rowData[h] = rows[r][idx] !== undefined ? rows[r][idx] : '';
      });
      dataRows.push(rowData);
    }
    
    const types = computeColumnTypes(headers, dataRows);
    return { headers, rows: dataRows, types };
  };

  const handleAiduFileUpload = (file) => {
    if (!file.name.endsWith('.csv')) {
      alert('CSV 형식의 파일만 업로드할 수 있습니다.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      
      let text;
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        text = utf8Decoder.decode(arrayBuffer);
      } catch {
        try {
          const eucKrDecoder = new TextDecoder('euc-kr');
          text = eucKrDecoder.decode(arrayBuffer);
        } catch {
          alert('파일 디코딩 실패: 파일의 인코딩을 확인해 주세요.');
          return;
        }
      }
      
      const parsed = parseCsvData(text);
      if (parsed.headers.length === 0) {
        alert('올바르지 않은 CSV 데이터 구조입니다.');
        return;
      }
      
      setUploadedFiles(prev => ({
        ...prev,
        [file.name]: parsed
      }));
      setActiveFilename(file.name);
      setSelectedColumns([...parsed.headers]);
      
      const N = parsed.rows.length;
      const initialEnd = Math.max(1, Math.floor(N * 0.3));
      setDataRangeStart(0);
      setDataRangeEnd(initialEnd);
      setVizRenderState(null);
      setHueColumn('');
      setActiveChart('none');
      setBoxplotY('');
      setBoxplotX('');
      setDistributionX('');
      setAnalysisResults(null);
      setAiduTab('describe');
    };
    reader.readAsArrayBuffer(file);
  };

  const performAnalysis = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return;
    const { headers, rows } = uploadedFiles[activeFilename];
    if (rows.length === 0) return;
    
    const activeRows = rows.slice(dataRangeStart, dataRangeEnd);
    if (activeRows.length === 0) {
      alert('분석할 데이터 범위에 행이 존재하지 않습니다.');
      return;
    }
    
    const results = {};
    
    // Determine overall stats
    const totalObs = activeRows.length;
    const totalVars = headers.length;
    let totalMissing = 0;
    
    // Helper to format values dynamically based on type
    const formatVal = (num, colType, isIntOnly = false) => {
      if (num === undefined || num === null || isNaN(num)) return '-';
      if (colType === 'float64') {
        return num.toFixed(2);
      } else if (colType === 'int64') {
        if (isIntOnly) return Math.round(num).toString();
        return Number.isInteger(num) ? num.toString() : num.toFixed(2);
      }
      return String(num);
    };

    // Find column data types and calculate column stats
    selectedColumns.forEach(col => {
      const values = activeRows.map(r => r[col]);
      
      // Check column type (numeric if >= 90% parseable as numbers, ignoring blanks)
      const nonBlankVals = values.filter(v => v !== null && v !== undefined && v !== '');
      let isNumeric = false;
      let numericValues = [];
      let colType = 'object';
      
      if (nonBlankVals.length > 0) {
        numericValues = nonBlankVals.map(Number).filter(v => !isNaN(v));
        // If at least 90% of non-blank values are numeric, we treat column as numeric
        if (numericValues.length / nonBlankVals.length >= 0.9) {
          isNumeric = true;
          const hasDecimal = numericValues.some(v => !Number.isInteger(v)) || nonBlankVals.some(v => String(v).includes('.'));
          colType = hasDecimal ? 'float64' : 'int64';
        }
      }
      
      const missingCount = totalObs - nonBlankVals.length;
      totalMissing += missingCount;
      
      // Base stats
      const distinctValues = Array.from(new Set(nonBlankVals));
      const distinctCount = distinctValues.length;
      
      const colResults = {
        name: col,
        type: colType,
        size: totalObs,
        distinct: distinctCount,
        distinctPct: ((distinctCount / totalObs) * 100).toFixed(2) + '%',
        missing: missingCount,
        missingPct: ((missingCount / totalObs) * 100).toFixed(2) + '%',
      };
      
      if (isNumeric && numericValues.length > 0) {
        // Zeros count
        const zerosCount = numericValues.filter(v => v === 0).length;
        colResults.zeros = zerosCount;
        colResults.zerosPct = ((zerosCount / totalObs) * 100).toFixed(2) + '%';
        
        // Sum, Mean
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const mean = sum / numericValues.length;
        colResults.mean = formatVal(mean, colType);
        
        // Min, Max
        numericValues.sort((a, b) => a - b);
        const min = numericValues[0];
        const max = numericValues[numericValues.length - 1];
        colResults.min = formatVal(min, colType, true);
        colResults.max = formatVal(max, colType, true);
        
        // Median (50th percentile)
        const getPercentile = (arr, p) => {
          if (arr.length === 0) return 0;
          const idx = (arr.length - 1) * p;
          const low = Math.floor(idx);
          const high = Math.ceil(idx);
          return arr[low] + (arr[high] - arr[low]) * (idx - low);
        };
        
        const median = getPercentile(numericValues, 0.5);
        colResults.median = formatVal(median, colType);
        
        // Standard Deviation
        const sqDiffs = numericValues.map(v => Math.pow(v - mean, 2));
        const variance = sqDiffs.reduce((a, b) => a + b, 0) / numericValues.length;
        const sd = Math.sqrt(variance);
        colResults.sd = formatVal(sd, colType);
        
        // Skewness
        const skewness = sd > 0 ? (3 * (mean - median) / sd) : 0;
        colResults.skewness = formatVal(skewness, colType);
        
        // Quantiles
        colResults.quantiles = {
          min: formatVal(min, colType, true),
          p5: formatVal(getPercentile(numericValues, 0.05), colType),
          q1: formatVal(getPercentile(numericValues, 0.25), colType),
          median: colResults.median,
          q3: formatVal(getPercentile(numericValues, 0.75), colType),
          p95: formatVal(getPercentile(numericValues, 0.95), colType),
          max: formatVal(max, colType, true)
        };
        
        // Generate Histogram data (10 bins)
        const binCount = 10;
        const range = max - min;
        const binWidth = range > 0 ? range / binCount : 1;
        const bins = Array.from({ length: binCount }, (_, i) => {
          const binStart = min + i * binWidth;
          const binEnd = binStart + binWidth;
          return {
            start: binStart,
            end: binEnd,
            count: 0,
            label: range > 0 ? `${formatVal(binStart, colType, true)}` : `${formatVal(binStart, colType, true)}`
          };
        });
        
        numericValues.forEach(v => {
          let binIdx = Math.floor((v - min) / binWidth);
          if (binIdx >= binCount) binIdx = binCount - 1;
          if (binIdx < 0) binIdx = 0;
          bins[binIdx].count++;
        });
        
        colResults.chartData = bins.map(b => ({
          label: b.label,
          count: b.count,
          percentage: ((b.count / numericValues.length) * 100).toFixed(1)
        }));
      } else {
        // Categorical chart data (top 5 values count)
        const valueCounts = {};
        nonBlankVals.forEach(v => {
          valueCounts[v] = (valueCounts[v] || 0) + 1;
        });
        
        const sortedFrequencies = Object.keys(valueCounts)
          .map(k => ({ value: k, count: valueCounts[k] }))
          .sort((a, b) => b.count - a.count);
          
        colResults.topFrequencies = sortedFrequencies.slice(0, 5).map(item => ({
          value: item.value,
          count: item.count,
          percentage: ((item.count / nonBlankVals.length) * 100).toFixed(2) + '%'
        }));
        
        // Chart data for categorical (up to 5 categories + Others)
        const chartData = sortedFrequencies.slice(0, 5).map(item => ({
          label: item.value,
          count: item.count,
          percentage: ((item.count / nonBlankVals.length) * 100).toFixed(1)
        }));
        
        if (sortedFrequencies.length > 5) {
          const othersCount = sortedFrequencies.slice(5).reduce((a, b) => a + b.count, 0);
          chartData.push({
            label: 'Others',
            count: othersCount,
            percentage: ((othersCount / nonBlankVals.length) * 100).toFixed(1)
          });
        }
        colResults.chartData = chartData;
      }
      
      results[col] = colResults;
    });
    
    // Overall Stats Object
    const int64ColsCount = selectedColumns.filter(c => results[c].type === 'int64').length;
    const float64ColsCount = selectedColumns.filter(c => results[c].type === 'float64').length;
    const objectColsCount = selectedColumns.filter(c => results[c].type === 'object').length;
    
    const missingCellRatio = ((totalMissing / (totalObs * totalVars)) * 100).toFixed(2) + '%';
    
    // Calculate duplicated rows
    const serializedRows = activeRows.map(r => JSON.stringify(r));
    const uniqueSerializedRows = new Set(serializedRows);
    const duplicatedRowsCount = activeRows.length - uniqueSerializedRows.size;
    const duplicatedRowsRatio = ((duplicatedRowsCount / activeRows.length) * 100).toFixed(2) + '%';
    
    const overallStats = {
      num_of_obs: totalObs,
      num_of_var: totalVars,
      missing_cell: totalMissing,
      missing_cell_ratio: missingCellRatio,
      duplicated_rows: duplicatedRowsCount,
      duplicated_rows_ratio: duplicatedRowsRatio,
      types: {
        int64: int64ColsCount,
        float64: float64ColsCount,
        object: objectColsCount
      }
    };
    
    setAnalysisResults({ overall: overallStats, columns: results });
  };

  const renderAiduImportTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>데이터 가져오기</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          분석에 사용할 CSV 파일을 업로드해 주세요. (예: `amount.csv` 또는 문제 지문에 명시된 데이터셋)
        </p>
        
        <div 
          className="aidu-import-zone"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length > 0) handleAiduFileUpload(files[0]);
          }}
          onClick={() => document.getElementById('aidu-file-input').click()}
        >
          <UploadCloud size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
          <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>여기에 CSV 파일을 드래그 앤 드롭 하거나 클릭하여 업로드</p>
          <input 
            type="file" 
            id="aidu-file-input" 
            accept=".csv" 
            style={{ display: 'none' }} 
            onChange={(e) => {
              if (e.target.files.length > 0) handleAiduFileUpload(e.target.files[0]);
            }}
          />
        </div>

        {Object.keys(uploadedFiles).length > 0 && (
          <div className="aidu-card">
            <div className="aidu-card-header">업로드된 데이터셋 목록</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.keys(uploadedFiles).map(name => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'var(--bg-main)', borderRadius: '4px', fontSize: '0.85rem' }}>
                  <span>{name} ({uploadedFiles[name].rows.length}행)</span>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setActiveFilename(name);
                      const file = uploadedFiles[name];
                      if (file) {
                        setSelectedColumns([...file.headers]);
                        const N = file.rows.length;
                        setDataRangeStart(0);
                        setDataRangeEnd(Math.max(1, Math.floor(N * 0.3)));
                      }
                      setAnalysisResults(null);
                      setAiduTab('describe');
                    }}
                  >
                    분석실 이동
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAiduDescribeTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const fileData = uploadedFiles[activeFilename];
    const { headers, rows, types } = fileData;

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* Left Settings Panel */}
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>작업 데이터 선택</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem', padding: '0.4rem' }}
              value={activeFilename}
              onChange={(e) => {
                const fname = e.target.value;
                setActiveFilename(fname);
                const file = uploadedFiles[fname];
                if (file) {
                  setSelectedColumns([...file.headers]);
                  const N = file.rows.length;
                  setDataRangeStart(0);
                  setDataRangeEnd(Math.max(1, Math.floor(N * 0.3)));
                }
                setAnalysisResults(null);
              }}
            >
              {Object.keys(uploadedFiles).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Hue 컬럼 선택</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem', padding: '0.4rem' }}
              value={hueColumn}
              onChange={(e) => setHueColumn(e.target.value)}
            >
              <option value="">선택 안 함 (None)</option>
              {headers.map(col => {
                const colType = fileData.types?.[col] || 'object';
                return (
                  <option key={col} value={col}>
                    {col} ({colType})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>데이터 범위</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>0</span>
              <input 
                type="range" 
                min="0" 
                max={fileData.rows.length} 
                value={dataRangeEnd}
                onChange={(e) => {
                  setDataRangeEnd(Number(e.target.value));
                }}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fileData.rows.length.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <input 
                type="number" 
                className="form-control"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', width: '80px', height: '28px', textAlign: 'right' }}
                min="0"
                max={fileData.rows.length}
                value={dataRangeEnd}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(Number(e.target.value), fileData.rows.length));
                  setDataRangeEnd(val);
                }}
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: 0 }}>컬럼 선택</label>
              <button 
                type="button" 
                className="btn-text-action" 
                style={{ fontSize: '0.7rem' }}
                onClick={() => {
                  if (selectedColumns.length === fileData.headers.length) {
                    setSelectedColumns([]);
                  } else {
                    setSelectedColumns([...fileData.headers]);
                  }
                }}
              >
                {selectedColumns.length === fileData.headers.length ? '모두 해제' : '모두 선택'}
              </button>
            </div>
            
            <div className="aidu-column-list">
              {fileData.headers.map(col => {
                const isSelected = selectedColumns.includes(col);
                const colType = fileData.types?.[col] || 'object';
                
                return (
                  <div 
                    key={col} 
                    className={`aidu-column-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedColumns(selectedColumns.filter(c => c !== col));
                      } else {
                        setSelectedColumns([...selectedColumns, col]);
                      }
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{col}</span>
                    <span className="aidu-column-type">{colType}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full"
            style={{ fontSize: '0.85rem', padding: '0.6rem' }}
            onClick={performAnalysis}
            disabled={selectedColumns.length === 0}
          >
            분석하기
          </button>
        </div>

        {/* Right Results Panel */}
        <div className="aidu-results-panel">
          {!analysisResults ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', gap: '0.5rem' }}>
              <HelpCircle size={36} />
              <p style={{ fontSize: '0.85rem' }}>좌측에서 분석할 컬럼을 선택하고 [분석하기]를 눌러주세요.</p>
            </div>
          ) : (
            <>
              {/* Overall Statistics: Side-by-side Summary Cards */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                
                {/* Card 1: Data Information */}
                <div className="aidu-card" style={{ flex: 1.2, padding: '0.6rem 0.8rem', border: '1px solid #dfe1e6', borderRadius: '4px', backgroundColor: '#ffffff', boxShadow: 'none' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.75rem', marginBottom: '0.35rem', color: '#172b4d' }}>데이터 정보 (Data Information)</div>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.68rem', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem 0.15rem 0', borderBottom: '1px solid #dfe1e6', color: '#5e6c84', fontSize: '0.6rem', fontWeight: '600' }}>항목</th>
                        <th style={{ textAlign: 'right', padding: '0.15rem 0 0.15rem 0.25rem', borderBottom: '1px solid #dfe1e6', color: '#5e6c84', fontSize: '0.6rem', fontWeight: '600' }}>값</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>num_of_obs (관측치 수)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', fontWeight: 'bold', color: '#172b4d' }}>{analysisResults.overall.num_of_obs.toLocaleString()}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>num_of_var (변수 수)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', fontWeight: 'bold', color: '#172b4d' }}>{analysisResults.overall.num_of_var}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>missing_cell (결측치 총합)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', color: '#172b4d' }}>{analysisResults.overall.missing_cell}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>missing_cell_ratio (결측 비율)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', color: '#172b4d' }}>{analysisResults.overall.missing_cell_ratio}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>duplicated_rows (중복 행)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', color: '#172b4d' }}>{analysisResults.overall.duplicated_rows}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>duplicated_rows_ratio (중복 비율)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', color: '#172b4d' }}>{analysisResults.overall.duplicated_rows_ratio}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Card 2: Type Summary */}
                <div className="aidu-card" style={{ flex: 0.8, padding: '0.6rem 0.8rem', border: '1px solid #dfe1e6', borderRadius: '4px', backgroundColor: '#ffffff', boxShadow: 'none' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.75rem', marginBottom: '0.35rem', color: '#172b4d' }}>데이터 유형 요약 (Type Summary)</div>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.68rem', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem 0.15rem 0', borderBottom: '1px solid #dfe1e6', color: '#5e6c84', fontSize: '0.6rem', fontWeight: '600' }}>타입</th>
                        <th style={{ textAlign: 'right', padding: '0.15rem 0 0.15rem 0.25rem', borderBottom: '1px solid #dfe1e6', color: '#5e6c84', fontSize: '0.6rem', fontWeight: '600' }}>개수</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>numeric (수치형)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', fontWeight: 'bold', color: '#172b4d' }}>{analysisResults.overall.types.numeric}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #dfe1e6' }}>
                        <td style={{ padding: '0.12rem 0.25rem 0.12rem 0', color: '#5e6c84' }}>object (범주형)</td>
                        <td style={{ textAlign: 'right', padding: '0.12rem 0 0.12rem 0.25rem', fontWeight: 'bold', color: '#172b4d' }}>{analysisResults.overall.types.object}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>

              {/* Column Breakdowns */}
              {Object.keys(analysisResults.columns).map(colName => (
                <AiduColumnCard key={colName} colName={colName} col={analysisResults.columns[colName]} />
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAiduSampleTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows } = uploadedFiles[activeFilename];

    return (
      <div style={{ flex: 1, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>데이터 샘플 보기 (상위 100행)</h3>
        
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}>
          <table className="aidu-table" style={{ minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={{ width: '50px', backgroundColor: 'var(--bg-main)', position: 'sticky', left: 0 }}>#</th>
                {headers.map(h => (
                  <th key={h} style={{ backgroundColor: 'var(--bg-main)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 'bold', backgroundColor: 'var(--bg-main)', position: 'sticky', left: 0 }}>{idx + 1}</td>
                  {headers.map(h => (
                    <td key={h}>{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // AIDU Platform Simulator Sub-tab Renderers
  // -------------------------------------------------------------

  const renderAiduHomeTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <div style={{ padding: '2rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary)', marginBottom: '0.75rem' }}>AIDU 데이터 분석 및 인공지능 플랫폼</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            본 모의고사 평가 시스템에는 AICE 실기 시험 대비를 위한 **AIDU 시뮬레이터**가 기본 통합되어 있습니다.<br />
            좌측 메뉴를 활용하여 업로드된 데이터셋의 기초 정보를 분석하고, 시각화하고, AI 모델을 학습/활용할 수 있습니다.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="aidu-card">
            <div className="aidu-card-header">작업 공간 정보</div>
            <table className="aidu-table">
              <tbody>
                <tr>
                  <td>프로젝트명</td>
                  <td style={{ fontWeight: '600' }}>AICE_Basic_Mock_Project</td>
                </tr>
                <tr>
                  <td>활성 데이터셋</td>
                  <td>{activeFilename ? activeFilename : '선택된 데이터셋 없음'}</td>
                </tr>
                <tr>
                  <td>전체 로드된 파일 수</td>
                  <td>{Object.keys(uploadedFiles).length}개</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="aidu-card">
            <div className="aidu-card-header">사용 안내</div>
            <ul style={{ fontSize: '0.8rem', paddingLeft: '1.2rem', lineHeight: '1.6', color: 'var(--text-main)' }}>
              <li><strong>데이터 가져오기</strong>: 분석용 CSV 파일을 선택하거나 추가 업로드합니다.</li>
              <li><strong>기초정보분석</strong>: 수치형/범주형 변수의 통계량 및 히스토그램을 연산합니다.</li>
              <li><strong>데이터 가공</strong>: 결측치 제거, 원핫 인코딩 등 가공을 수행합니다.</li>
              <li><strong>AI 모델 학습</strong>: 선형 회귀 등을 통해 학습하고 성능 지표를 도출합니다.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduVisualizeTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const fileData = uploadedFiles[activeFilename];
    const { headers } = fileData;
    
    // Helper to check numeric column
    const isNumericColumn = (col) => {
      const type = fileData.types?.[col];
      if (type) return type === 'int64' || type === 'float64';
      const nonBlank = fileData.rows.map(r => r[col]).filter(v => v !== undefined && v !== '');
      if (nonBlank.length === 0) return false;
      return nonBlank.every(v => !isNaN(Number(v)));
    };

    // Columns lists for type check
    
    // Perform viz analysis
    const handlePerformVizAnalysis = () => {
      let cols = [...selectedColumns];
      if (vizType === 'boxplot') {
        cols = [boxplotY, boxplotX].filter(Boolean);
      } else if (vizType === 'distribution') {
        cols = [distributionX].filter(Boolean);
      }

      setVizRenderState({
        type: vizType,
        columns: cols,
        boxplotY,
        boxplotX,
        distributionX,
        rangeEnd: dataRangeEnd
      });
      setActiveChart(vizType);
    };

    const currentVizType = activeChart;
    const currentCols = vizRenderState?.columns || [];
    const currentRangeEnd = vizRenderState?.rangeEnd || Math.max(1, Math.floor(fileData.rows.length * 0.3));
    const currentSlicedRows = fileData.rows.slice(0, currentRangeEnd);

    // Calculate correlation for selected numeric cols
    const getCorrelationMatrix = () => {
      const cols = currentCols.filter(isNumericColumn);
      if (cols.length < 2) return null;
      const matrix = [];

      cols.forEach(c1 => {
        const rowData = { column: c1 };
        const v1 = currentSlicedRows.map(r => Number(r[c1])).filter(v => !isNaN(v));
        const mean1 = v1.length ? v1.reduce((a, b) => a + b, 0) / v1.length : 0;
        
        cols.forEach(c2 => {
          const v2 = currentSlicedRows.map(r => Number(r[c2])).filter(v => !isNaN(v));
          const mean2 = v2.length ? v2.reduce((a, b) => a + b, 0) / v2.length : 0;
          
          let num = 0;
          let den1 = 0;
          let den2 = 0;
          for (let i = 0; i < currentSlicedRows.length; i++) {
            const val1 = Number(currentSlicedRows[i]?.[c1]);
            const val2 = Number(currentSlicedRows[i]?.[c2]);
            if (isNaN(val1) || isNaN(val2)) continue;
            const diff1 = val1 - mean1;
            const diff2 = val2 - mean2;
            num += diff1 * diff2;
            den1 += diff1 * diff1;
            den2 += diff2 * diff2;
          }
          const corr = (den1 && den2) ? num / Math.sqrt(den1 * den2) : (c1 === c2 ? 1.0 : 0.0);
          rowData[c2] = corr;
        });
        matrix.push(rowData);
      });
      return { columns: cols, matrix };
    };

    const corrData = currentVizType === 'heatmap' ? getCorrelationMatrix() : null;

    // Render Heatmap SVG
    const renderHeatmapSvg = () => {
      if (!corrData || corrData.columns.length < 2) {
        return (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-light)' }}>
            상관관계를 분석할 수치형 컬럼을 2개 이상 선택해 주세요.
          </div>
        );
      }
      
      const cols = corrData.columns;
      const matrix = corrData.matrix;
      const numCols = cols.length;

      const svgWidth = 550;
      const svgHeight = 450;
      const paddingLeft = 120;
      const paddingBottom = 80;
      const paddingTop = 30;
      const paddingRight = 60;
      
      const gridWidth = svgWidth - paddingLeft - paddingRight;
      const gridHeight = svgHeight - paddingTop - paddingBottom;
      const cellWidth = gridWidth / numCols;
      const cellHeight = gridHeight / numCols;

      const getHeatmapColor = (val) => {
        if (val >= 0) {
          // Dark burgundy red (#7f1d1d) to beige (#fff7ed)
          const r = Math.round(255 - (255 - 127) * val);
          const g = Math.round(247 - (247 - 29) * val);
          const b = Math.round(237 - (237 - 29) * val);
          return `rgb(${r}, ${g}, ${b})`;
        } else {
          // Dark blue (#1e3a8a) to beige (#fff7ed)
          const absVal = Math.abs(val);
          const r = Math.round(255 - (255 - 30) * absVal);
          const g = Math.round(247 - (247 - 58) * absVal);
          const b = Math.round(237 - (237 - 138) * absVal);
          return `rgb(${r}, ${g}, ${b})`;
        }
      };

      const cells = [];
      const labels = [];

      for (let i = 0; i < numCols; i++) {
        const c1 = cols[i];
        // Y Axis Labels (bottom to top matching X axis left to right)
        const yCoord = paddingTop + (numCols - 1 - i) * cellHeight + cellHeight / 2;
        labels.push(
          <text 
            key={`y-${c1}`} 
            x={paddingLeft - 8} 
            y={yCoord} 
            textAnchor="end" 
            dominantBaseline="middle" 
            fontSize="9" 
            fontWeight="500"
            fill="var(--text-muted)"
            style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {c1}
          </text>
        );

        // X Axis Labels
        const xCoord = paddingLeft + i * cellWidth + cellWidth / 2;
        labels.push(
          <text 
            key={`x-${c1}`} 
            x={xCoord} 
            y={svgHeight - paddingBottom + 15} 
            textAnchor="middle" 
            fontSize="9" 
            fontWeight="500"
            fill="var(--text-muted)"
            transform={`rotate(-20 ${xCoord} ${svgHeight - paddingBottom + 15})`}
          >
            {c1}
          </text>
        );

        for (let j = 0; j < numCols; j++) {
          const c2 = cols[j];
          const val = matrix[i][c2];
          const cellX = paddingLeft + j * cellWidth;
          const cellY = paddingTop + (numCols - 1 - i) * cellHeight;
          const color = getHeatmapColor(val);
          const textColor = Math.abs(val) > 0.55 ? '#ffffff' : 'var(--text-main)';

          cells.push(
            <g key={`cell-${i}-${j}`}>
              <rect 
                x={cellX} 
                y={cellY} 
                width={cellWidth - 1} 
                height={cellHeight - 1} 
                fill={color} 
                stroke="rgba(255,255,255,0.05)"
              />
              <text 
                x={cellX + cellWidth / 2} 
                y={cellY + cellHeight / 2} 
                textAnchor="middle" 
                dominantBaseline="middle" 
                fontSize="9" 
                fontWeight="bold" 
                fill={textColor}
              >
                {val === 1.0 ? '1' : val.toFixed(3)}
              </text>
            </g>
          );
        }
      }

      // Colorbar gradient definition
      const gradient = (
        <defs>
          <linearGradient id="colorbar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(127, 29, 29)" />
            <stop offset="50%" stopColor="rgb(255, 247, 237)" />
            <stop offset="100%" stopColor="rgb(30, 58, 138)" />
          </linearGradient>
        </defs>
      );

      // Colorbar ticks
      const colorbarX = svgWidth - paddingRight + 20;
      const colorbarHeight = gridHeight;
      const colorbarTicks = [1, 0.5, 0, -0.5, -1].map(t => {
        const offsetPercent = (1 - t) / 2; // Maps 1 to 0%, 0 to 50%, -1 to 100%
        const y = paddingTop + offsetPercent * colorbarHeight;
        return (
          <g key={`tick-${t}`}>
            <line x1={colorbarX + 15} y1={y} x2={colorbarX + 20} y2={y} stroke="var(--border-color)" strokeWidth="1" />
            <text x={colorbarX + 24} y={y} dominantBaseline="middle" fontSize="8" fill="var(--text-muted)">{t}</text>
          </g>
        );
      });

      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', height: '100%' }}>
          <svg viewBox="0 0 550 450" style={{ width: '100%', height: 'auto', maxWidth: '550px', maxHeight: '450px' }}>
            {gradient}
            {/* Grid Cells */}
            {cells}
            {/* Grid Labels */}
            {labels}
            {/* Colorbar */}
            <rect x={colorbarX} y={paddingTop} width="15" height={colorbarHeight} fill="url(#colorbar-grad)" rx="2" />
            {colorbarTicks}
          </svg>
        </div>
      );
    };

    // Render Scatter SVG
    const renderScatterPlot = () => {
      const numericSelected = currentCols.filter(isNumericColumn);
      if (numericSelected.length < 2) {
        return (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', padding: '1rem' }}>
            산점도를 그리려면 수치형 변수를 2개 이상 선택해 주세요.
          </p>
        );
      }

      const K = numericSelected.length;
      const hasHue = hueColumn && headers.includes(hueColumn);

      // Pre-calculate min/max for each numeric column to avoid nested loops recalculation
      const colStats = {};
      numericSelected.forEach(col => {
        const vals = currentSlicedRows.map(r => Number(r[col])).filter(v => !isNaN(v));
        colStats[col] = {
          vals,
          min: vals.length ? Math.min(...vals) : 0,
          max: vals.length ? Math.max(...vals) : 1
        };
      });

      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', width: '100%' }}>
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: `repeat(${K}, 1fr)`, 
              gap: '6px', 
              flexGrow: 1,
              maxWidth: '550px',
              padding: '0.5rem', 
              backgroundColor: 'var(--bg-card)', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)',
              boxSizing: 'border-box'
            }}
          >
            {numericSelected.map((yCol, i) => {
              return numericSelected.map((xCol, j) => {
                const key = `cell-${i}-${j}`;
                
                if (i === j) {
                  // Diagonal: Column name
                  return (
                    <div 
                      key={key} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        border: '1px dashed var(--border-color)', 
                        borderRadius: '4px', 
                        background: 'var(--bg-main)',
                        padding: '4px',
                        aspectRatio: '1',
                        boxSizing: 'border-box'
                      }}
                    >
                      <span 
                        style={{ 
                          fontSize: '8px', 
                          fontWeight: 'bold', 
                          textAlign: 'center', 
                          color: 'var(--text-main)', 
                          wordBreak: 'break-all',
                          lineHeight: '1.2'
                        }}
                      >
                        {xCol}
                      </span>
                    </div>
                  );
                }

                // Non-diagonal: Pairwise scatter plot
                const xStat = colStats[xCol];
                const yStat = colStats[yCol];
                const xMin = xStat.min;
                const xMax = xStat.max;
                const yMin = yStat.min;
                const yMax = yStat.max;

                const points = currentSlicedRows.map((r, idx) => {
                  const xVal = Number(r[xCol]);
                  const yVal = Number(r[yCol]);
                  if (isNaN(xVal) || isNaN(yVal)) return null;

                  const cx = 15 + ((xVal - xMin) / (xMax - xMin || 1)) * 70;
                  const cy = 85 - ((yVal - yMin) / (yMax - yMin || 1)) * 70;

                  // Hue Color Code (Blue for 1, Orange for 0)
                  let dotFill = "var(--primary)";
                  if (hasHue && r[hueColumn] !== undefined) {
                    const hueVal = String(r[hueColumn]);
                    if (hueVal === '1') {
                      dotFill = "#3b82f6";
                    } else if (hueVal === '0') {
                      dotFill = "#f97316";
                    }
                  }

                  return <circle key={idx} cx={cx} cy={cy} r="2" fill={dotFill} opacity="0.8" />;
                }).filter(Boolean).slice(0, 300); // 300 points for denser scatter

                return (
                  <div 
                    key={key} 
                    style={{ 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '4px', 
                      background: 'var(--bg-main)',
                      aspectRatio: '1',
                      padding: '2px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                      {/* Axes */}
                      <line x1="15" y1="85" x2="85" y2="85" stroke="var(--border-color)" strokeWidth="1" />
                      <line x1="15" y1="15" x2="15" y2="85" stroke="var(--border-color)" strokeWidth="1" />

                      {/* Data Points */}
                      {points}

                      {/* Bounds Ticks Text */}
                      <text x="15" y="93" fontSize="6" fill="var(--text-muted)" textAnchor="middle">{xMin.toFixed(1)}</text>
                      <text x="85" y="93" fontSize="6" fill="var(--text-muted)" textAnchor="middle">{xMax.toFixed(1)}</text>
                      <text x="12" y="85" fontSize="6" fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">{yMin.toFixed(1)}</text>
                      <text x="12" y="15" fontSize="6" fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">{yMax.toFixed(1)}</text>
                    </svg>
                  </div>
                );
              });
            })}
          </div>

          {/* Right vertical legend */}
          {hasHue && (
            <div 
              style={{ 
                width: '100px', 
                flexShrink: 0, 
                display: 'flex', 
                flexDirection: 'column', 
                borderLeft: '1px solid var(--border-color)', 
                paddingLeft: '0.75rem',
                boxSizing: 'border-box',
                marginTop: '1rem'
              }}
            >
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                {hueColumn}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: '6px', height: '6px', backgroundColor: '#3b82f6', borderRadius: '50%' }} />
                  <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>1</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: '6px', height: '6px', backgroundColor: '#f97316', borderRadius: '50%' }} />
                  <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>0</span>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Render Boxplot SVG
    const renderBoxPlot = () => {
      const numericSelected = currentCols.filter(isNumericColumn);
      if (numericSelected.length < 1) {
        return (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', padding: '1rem' }}>
            박스차트를 그리려면 수치형 변수를 1개 이상 선택해 주세요.
          </p>
        );
      }
      
      const targetCol = numericSelected[0];
      const hasHue = hueColumn && headers.includes(hueColumn);

      // Grouping data
      const groups = {};
      if (hasHue) {
        currentSlicedRows.forEach(r => {
          const val = Number(r[targetCol]);
          const hueVal = r[hueColumn];
          if (!isNaN(val) && hueVal !== undefined && hueVal !== '') {
            if (!groups[hueVal]) groups[hueVal] = [];
            groups[hueVal].push(val);
          }
        });
      } else {
        const vals = currentSlicedRows.map(r => Number(r[targetCol])).filter(v => !isNaN(v));
        if (vals.length > 0) {
          groups['전체'] = vals;
        }
      }

      const groupNames = Object.keys(groups).sort();
      if (groupNames.length === 0) {
        return (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', padding: '1rem' }}>
            유효한 수치형 데이터가 존재하지 않습니다.
          </p>
        );
      }

      // Calculate overall min/max for Y axis scale
      let allVals = [];
      groupNames.forEach(g => { allVals = allVals.concat(groups[g]); });
      const overallMin = Math.min(...allVals);
      const overallMax = Math.max(...allVals);
      const yRange = overallMax - overallMin || 1;

      // Calculate stats for each group
      const groupStats = groupNames.map(g => {
        const vals = [...groups[g]].sort((a, b) => a - b);
        const minVal = vals[0];
        const maxVal = vals[vals.length - 1];
        const q1 = vals[Math.floor(vals.length * 0.25)];
        const median = vals[Math.floor(vals.length * 0.5)];
        const q3 = vals[Math.floor(vals.length * 0.75)];
        return { name: g, minVal, q1, median, q3, maxVal };
      });

      const svgWidth = 400;
      const svgHeight = 280;
      const paddingY = 40;
      const paddingLeft = 50;
      const paddingRight = 30;
      const chartWidth = svgWidth - paddingLeft - paddingRight;

      const scaleY = (val) => {
        return svgHeight - paddingY - ((val - overallMin) / yRange) * (svgHeight - 2 * paddingY);
      };

      const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
      const bgColors = ['rgba(239, 68, 68, 0.15)', 'rgba(59, 130, 246, 0.15)', 'rgba(16, 185, 129, 0.15)', 'rgba(245, 158, 11, 0.15)'];

      return (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'stretch', 
            gap: '1rem', 
            padding: '1rem', 
            backgroundColor: 'var(--bg-card)', 
            borderRadius: '8px', 
            border: '1px solid var(--border-color)',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* Chart Canvas */}
          <div style={{ flexGrow: 1, position: 'relative' }}>
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', maxWidth: `${svgWidth}px` }}>
              {/* Title */}
              <text x={svgWidth / 2} y={20} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--text-main)">
                {targetCol} 분포 {hasHue ? `(by ${hueColumn})` : ''}
              </text>

              {/* Y Axis line */}
              <line x1={paddingLeft} y1={paddingY} x2={paddingLeft} y2={svgHeight - paddingY} stroke="var(--border-color)" strokeWidth="1.5" />
              
              {/* Y Axis ticks */}
              {[overallMin, overallMin + yRange * 0.25, overallMin + yRange * 0.5, overallMin + yRange * 0.75, overallMax].map((v, i) => {
                const y = scaleY(v);
                return (
                  <g key={i}>
                    <line x1={paddingLeft - 4} y1={y} x2={paddingLeft} y2={y} stroke="var(--border-color)" strokeWidth="1" />
                    <text x={paddingLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="7" fill="var(--text-muted)">
                      {v.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* X Axis base line */}
              <line x1={paddingLeft} y1={svgHeight - paddingY} x2={svgWidth - paddingRight} y2={svgHeight - paddingY} stroke="var(--border-color)" strokeWidth="1" />

              {/* Group Plots */}
              {groupStats.map((stat, idx) => {
                const numGroups = groupStats.length;
                // Calculate X coordinate for each box plot center
                const xCenter = paddingLeft + (chartWidth / (numGroups + 1)) * (idx + 1);
                const boxW = Math.min(45, chartWidth / (numGroups + 1) * 0.6);

                const yMin = scaleY(stat.minVal);
                const yQ1 = scaleY(stat.q1);
                const yMed = scaleY(stat.median);
                const yQ3 = scaleY(stat.q3);
                const yMax = scaleY(stat.maxVal);

                const color = colors[idx % colors.length];
                const bgColor = bgColors[idx % bgColors.length];

                return (
                  <g key={idx}>
                    {/* Whiskers */}
                    <line x1={xCenter} y1={yMin} x2={xCenter} y2={yQ1} stroke={color} strokeWidth="1.5" strokeDasharray="2,2" />
                    <line x1={xCenter} y1={yQ3} x2={xCenter} y2={yMax} stroke={color} strokeWidth="1.5" strokeDasharray="2,2" />
                    <line x1={xCenter - boxW/3} y1={yMin} x2={xCenter + boxW/3} y2={yMin} stroke={color} strokeWidth="1.5" />
                    <line x1={xCenter - boxW/3} y1={yMax} x2={xCenter + boxW/3} y2={yMax} stroke={color} strokeWidth="1.5" />

                    {/* Box */}
                    <rect 
                      x={xCenter - boxW/2} 
                      y={yQ3} 
                      width={boxW} 
                      height={Math.max(2, yQ1 - yQ3)} 
                      fill={bgColor} 
                      stroke={color} 
                      strokeWidth="1.5" 
                      rx="1"
                    />

                    {/* Median Line */}
                    <line x1={xCenter - boxW/2} y1={yMed} x2={xCenter + boxW/2} y2={yMed} stroke={color} strokeWidth="2.5" />

                    {/* X Label */}
                    <text x={xCenter} y={svgHeight - paddingY + 14} textAnchor="middle" fontSize="8" fontWeight="bold" fill="var(--text-muted)">
                      {stat.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Categorical Legend Block on Far Right */}
          <div 
            style={{ 
              width: '100px', 
              flexShrink: 0, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              borderLeft: '1px solid var(--border-color)', 
              paddingLeft: '0.75rem',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
              {hasHue ? hueColumn : '범례'}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {groupStats.map((stat, idx) => {
                const color = colors[idx % colors.length];
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: color, borderRadius: '2px', flexShrink: 0 }} />
                    <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stat.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    };

    // Render Distribution Hist SVG
    const renderDistributionPlot = () => {
      const numericSelected = currentCols.filter(isNumericColumn);
      if (numericSelected.length < 1) {
        return (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', padding: '1rem' }}>
            분포차트를 그리려면 수치형 변수를 1개 이상 선택해 주세요.
          </p>
        );
      }
      
      const targetCol = numericSelected[0];
      const hasHue = hueColumn && headers.includes(hueColumn);

      const allVals = currentSlicedRows.map(r => Number(r[targetCol])).filter(v => !isNaN(v));
      if (allVals.length === 0) {
        return (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', padding: '1rem' }}>
            수치형 데이터가 존재하지 않습니다.
          </p>
        );
      }

      const minVal = Math.min(...allVals);
      const maxVal = Math.max(...allVals);
      const range = maxVal - minVal || 1;
      const numBins = 10;
      const binWidth = range / numBins;

      // Grouping logic for bins
      const groupBins = {};
      if (hasHue) {
        currentSlicedRows.forEach(r => {
          const val = Number(r[targetCol]);
          const hueVal = r[hueColumn];
          if (!isNaN(val) && hueVal !== undefined && hueVal !== '') {
            if (!groupBins[hueVal]) {
              groupBins[hueVal] = Array(numBins).fill(0);
            }
            let binIdx = Math.floor((val - minVal) / binWidth);
            if (binIdx >= numBins) binIdx = numBins - 1;
            if (binIdx < 0) binIdx = 0;
            groupBins[hueVal][binIdx]++;
          }
        });
      } else {
        groupBins['Total'] = Array(numBins).fill(0);
        allVals.forEach(val => {
          let binIdx = Math.floor((val - minVal) / binWidth);
          if (binIdx >= numBins) binIdx = numBins - 1;
          if (binIdx < 0) binIdx = 0;
          groupBins['Total'][binIdx]++;
        });
      }

      const groupNames = Object.keys(groupBins).sort();
      let maxCount = 1;
      groupNames.forEach(g => {
        const m = Math.max(...groupBins[g]);
        if (m > maxCount) maxCount = m;
      });

      const svgWidth = 500;
      const svgHeight = 280;
      const padding = 45;
      const chartWidth = svgWidth - 2 * padding;
      const chartHeight = svgHeight - 2 * padding;
      const barWidth = chartWidth / numBins - 6;

      const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
      const fillColors = [
        'rgba(239, 68, 68, 0.55)', // Orange/Red for '0' / first
        'rgba(59, 130, 246, 0.55)', // Blue for '1' / second
        'rgba(16, 185, 129, 0.55)',
        'rgba(245, 158, 11, 0.55)'
      ];

      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', boxSizing: 'border-box' }}>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', maxWidth: `${svgWidth}px` }}>
            {/* Title */}
            <text x={svgWidth/2} y={20} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--text-main)">
              {targetCol} 분포 히스토그램 (10 Bins) {hasHue ? `(by ${hueColumn})` : ''}
            </text>
            
            {/* Axes */}
            <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="var(--border-color)" strokeWidth="1.5" />
            <line x1={padding} y1={padding} x2={padding} y2={svgHeight - padding} stroke="var(--border-color)" strokeWidth="1.5" />

            {/* Y ticks */}
            {[0, maxCount * 0.25, maxCount * 0.5, maxCount * 0.75, maxCount].map((v, i) => {
              const y = svgHeight - padding - (v / maxCount) * chartHeight;
              return (
                <g key={i}>
                  <line x1={padding - 4} y1={y} x2={padding} y2={y} stroke="var(--border-color)" strokeWidth="1" />
                  <text x={padding - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="7" fill="var(--text-muted)">
                    {Math.round(v)}
                  </text>
                </g>
              );
            })}

            {/* Hist Bars */}
            {Array(numBins).fill(0).map((_, binIdx) => {
              const x = padding + binIdx * (chartWidth / numBins) + 3;
              const binLow = minVal + binIdx * binWidth;
              const binHigh = binLow + binWidth;
              
              return (
                <g key={binIdx}>
                  {/* Overlapping Bars */}
                  {groupNames.map((gName, gIdx) => {
                    const count = groupBins[gName][binIdx] || 0;
                    if (count === 0) return null;
                    const barHeight = (count / maxCount) * chartHeight;
                    const y = svgHeight - padding - barHeight;
                    const fillColor = fillColors[gIdx % fillColors.length];
                    const strokeColor = colors[gIdx % colors.length];

                    return (
                      <rect 
                        key={gName}
                        x={x} 
                        y={y} 
                        width={barWidth} 
                        height={barHeight} 
                        fill={fillColor} 
                        stroke={strokeColor}
                        strokeWidth="1"
                        rx="1"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => {
                          setHoveredBin({
                            x: x + barWidth / 2,
                            y: y,
                            hueVal: gName,
                            rangeStr: `${binLow.toFixed(0)} - ${binHigh.toFixed(2)}`,
                            count
                          });
                        }}
                        onMouseLeave={() => setHoveredBin(null)}
                      />
                    );
                  })}
                  
                  {/* X Axis Tick Labels */}
                  <text 
                    x={x + barWidth/2} 
                    y={svgHeight - padding + 12} 
                    textAnchor="middle" 
                    fontSize="6" 
                    fill="var(--text-muted)"
                    transform={`rotate(-15 ${x + barWidth/2} ${svgHeight - padding + 12})`}
                  >
                    {binLow.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Hue Legend inside canvas on the top right */}
            <g transform={`translate(${svgWidth - padding - 95}, 30)`}>
              {/* Background card for legend */}
              <rect x="0" y="0" width="90" height={15 + groupNames.length * 12} fill="var(--bg-main)" stroke="var(--border-color)" strokeWidth="1" rx="3" opacity="0.9" />
              <text x="8" y="10" fontSize="6.5" fontWeight="bold" fill="var(--text-muted)">{hasHue ? hueColumn : '범례'}</text>
              {groupNames.map((gName, gIdx) => {
                const color = colors[gIdx % colors.length];
                const yPos = 20 + gIdx * 12;
                return (
                  <g key={gName} transform={`translate(8, ${yPos})`}>
                    <rect x="0" y="-5" width="8" height="6" fill={color} rx="1" />
                    <text x="14" y="0" fontSize="7" fontWeight="bold" fill="var(--text-main)">{gName}</text>
                  </g>
                );
              })}
            </g>

            {/* Hover Tooltip Overlay (matching image 4) */}
            {hoveredBin && (() => {
              const tooltipWidth = 110;
              const tooltipHeight = 42;
              let tx = hoveredBin.x - tooltipWidth / 2;
              let ty = hoveredBin.y - tooltipHeight - 6;

              // Boundary check
              if (tx < 10) tx = 10;
              if (tx + tooltipWidth > svgWidth - 10) tx = svgWidth - tooltipWidth - 10;
              if (ty < 10) ty = hoveredBin.y + 10;

              return (
                <g transform={`translate(${tx}, ${ty})`}>
                  <rect 
                    width={tooltipWidth} 
                    height={tooltipHeight} 
                    fill="#d24b33" 
                    stroke="#1a1a1a" 
                    strokeWidth="1.2" 
                    rx="1" 
                  />
                  <text x="6" y="11" fill="#1a1a1a" fontSize="7.5" fontWeight="bold">
                    {hasHue ? `${hueColumn}=${hoveredBin.hueVal}` : `Group=Total`}
                  </text>
                  <text x="6" y="23" fill="#1a1a1a" fontSize="7.5" fontWeight="bold">
                    {targetCol}={hoveredBin.rangeStr}
                  </text>
                  <text x="6" y="35" fill="#1a1a1a" fontSize="7.5" fontWeight="bold">
                    count={hoveredBin.count}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      );
    };

    // Render Wordcloud Grid
    const renderWordCloud = () => {
      // Find categorical columns
      const catCols = currentCols.filter(c => !isNumericColumn(c));
      const targetCol = catCols[0] || headers[0];
      
      const counts = {};
      currentSlicedRows.forEach(r => {
        const val = r[targetCol];
        if (val !== undefined && val !== '') {
          counts[val] = (counts[val] || 0) + 1;
        }
      });

      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 20);
      if (sorted.length === 0) return <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>카테고리 데이터가 존재하지 않습니다.</p>;

      const maxCount = sorted[0][1];
      const colors = ['#4f46e5', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'center', padding: '2rem', minHeight: '220px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {sorted.map(([word, count], i) => {
            // Size from 12px to 32px
            const fontSize = 12 + (count / maxCount) * 20;
            const color = colors[i % colors.length];
            return (
              <span key={word} style={{ fontSize: `${fontSize}px`, fontWeight: 'bold', color, margin: '5px', display: 'inline-block', opacity: 0.9 }}>
                {word}({count})
              </span>
            );
          })}
        </div>
      );
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* Left Settings Panel */}
        <div className="aidu-settings-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem' }}>시각화 설정</h4>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>작업 데이터 선택</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem', padding: '0.4rem' }}
              value={activeFilename}
              onChange={(e) => {
                const fname = e.target.value;
                setActiveFilename(fname);
                const file = uploadedFiles[fname];
                if (file) {
                  setSelectedColumns([...file.headers]);
                  const N = file.rows.length;
                  const initialEnd = Math.max(1, Math.floor(N * 0.3));
                  setDataRangeStart(0);
                  setDataRangeEnd(initialEnd);
                  setVizRenderState(null);
                  setHueColumn('');
                  setActiveChart('none');
                  setBoxplotY('');
                  setBoxplotX('');
                  setDistributionX('');
                }
              }}
            >
              {Object.keys(uploadedFiles).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>데이터 범위</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>0</span>
              <input 
                type="range" 
                min="0" 
                max={fileData.rows.length} 
                value={dataRangeEnd}
                onChange={(e) => {
                  setDataRangeEnd(Number(e.target.value));
                }}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fileData.rows.length.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <input 
                type="number" 
                className="form-control"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', width: '80px', height: '28px', textAlign: 'right' }}
                min="0"
                max={fileData.rows.length}
                value={dataRangeEnd}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(Number(e.target.value), fileData.rows.length));
                  setDataRangeEnd(val);
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>시각화 유형</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem', padding: '0.4rem' }}
              value={vizType} 
              onChange={(e) => setVizType(e.target.value)}
            >
              <option value="heatmap">히트맵</option>
              <option value="scatter">산점도</option>
              <option value="boxplot">박스차트</option>
              <option value="distribution">분포차트</option>
              <option value="wordcloud">워드클라우드</option>
            </select>
          </div>

          {(vizType === 'scatter' || vizType === 'boxplot' || vizType === 'distribution') && (
            <div className="form-group">
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Hue 컬럼 선택</label>
              <select 
                className="form-control" 
                style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                value={hueColumn}
                onChange={(e) => setHueColumn(e.target.value)}
              >
                <option value="">선택 안 함 (None)</option>
                {headers.map(col => {
                  const colType = fileData.types?.[col] || 'object';
                  return (
                    <option key={col} value={col}>
                      {col} ({colType})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: 0 }}>컬럼 선택</label>
              <button 
                type="button" 
                className="btn-text-action" 
                style={{ fontSize: '0.7rem' }}
                onClick={() => {
                  if (selectedColumns.length === headers.length) {
                    setSelectedColumns([]);
                  } else {
                    setSelectedColumns([...headers]);
                  }
                }}
              >
                {selectedColumns.length === headers.length ? '모두 해제' : '모두 선택'}
              </button>
            </div>
            
            <div className="aidu-column-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {headers.map(col => {
                const isSelected = selectedColumns.includes(col);
                const colType = fileData.types?.[col] || 'object';
                
                return (
                  <div 
                    key={col} 
                    className={`aidu-column-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedColumns(selectedColumns.filter(c => c !== col));
                      } else {
                        setSelectedColumns([...selectedColumns, col]);
                      }
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{col}</span>
                    <span className="aidu-column-type">{colType}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              <span>총 {selectedColumns.length}</span>
              <span>최대 {headers.length}</span>
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full"
            style={{ fontSize: '0.85rem', padding: '0.6rem' }}
            onClick={handlePerformVizAnalysis}
            disabled={selectedColumns.length === 0}
          >
            분석하기
          </button>
        </div>

        {/* Right Results Panel */}
        <div className="aidu-results-panel" style={{ overflowY: 'auto', flexGrow: 1, height: '100%', width: '100%' }}>
          <div className="aidu-card" style={{ position: 'relative' }}>
            <div className="aidu-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>시각화 분석 결과</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-muted)' }}>
                  대상 데이터: {activeFilename}
                </span>
                {vizRenderState && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button type="button" className="btn-text-action" style={{ fontSize: '0.7rem', padding: '2px 5px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-main)' }} onClick={() => alert('차트 이미지 다운로드 완료(데모)')}>💾 다운로드</button>
                    <button type="button" className="btn-text-action" style={{ fontSize: '0.7rem', padding: '2px 5px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-main)' }} onClick={() => alert('차트 줌 인(데모)')}>🔍 줌</button>
                    <button type="button" className="btn-text-action" style={{ fontSize: '0.7rem', padding: '2px 5px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-main)' }} onClick={() => alert('차트 상태 초기화(데모)')}>🔄 리셋</button>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ marginTop: '0.5rem', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {activeChart === 'none' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', flexGrow: 1, color: 'var(--text-muted)', gap: '0.75rem' }}>
                  <div style={{ fontSize: '2.5rem', opacity: 0.4 }}>📊</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-light)' }}>
                    분석하기 버튼을 클릭하여 데이터를 시각화하세요
                  </div>
                </div>
              )}
              {activeChart === 'heatmap' && (
                <div style={{ flexGrow: 1, width: '100%', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>히트맵</div>
                  {renderHeatmapSvg()}
                </div>
              )}
              {activeChart === 'scatter' && (
                <div style={{ flexGrow: 1, width: '100%', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>산점도</div>
                  {renderScatterPlot()}
                </div>
              )}
              {activeChart === 'boxplot' && (
                <div style={{ flexGrow: 1, width: '100%', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>박스차트</div>
                  {renderBoxPlot()}
                </div>
              )}
              {activeChart === 'distribution' && (
                <div style={{ flexGrow: 1, width: '100%', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>분포차트</div>
                  {renderDistributionPlot()}
                </div>
              )}
              {activeChart === 'wordcloud' && (
                <div style={{ flexGrow: 1, width: '100%', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>워드클라우드</div>
                  {renderWordCloud()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduUnsupervisedTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>비지도 분석 유형</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }} disabled>
              <option>K-Means Clustering</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>클러스터 개수 (K)</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }}>
              <option>2</option>
              <option>3</option>
              <option>4</option>
            </select>
          </div>

          <button type="button" className="btn btn-primary btn-full" style={{ fontSize: '0.85rem' }} onClick={() => alert('본 모의고사 평가의 비지도 학습 분석 연산 기능은 데모 모드입니다.')}>
            군집화 수행
          </button>
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
            <HelpCircle size={48} color="var(--primary)" />
            <h4 style={{ fontWeight: 'bold', fontSize: '1rem', margin: 0 }}>비지도 학습 분석 (Clustering)</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: '1.5' }}>
              K-Means 군집 분석은 라벨(정답)이 없는 데이터 포인트들을 거리 기반으로 유사한 k개의 집합으로 묶어주는 인공지능 기법입니다.<br />
              본 Mock 평가에서는 수치형 기초 통계분석 및 가공/회귀 모델 학습 위주로 비지도 분석은 기본 안내 데모만 제공됩니다.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduPreprocessTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows, types } = uploadedFiles[activeFilename];

    const colName = preprocessSelectedCol || headers[0] || '';
    const colType = types?.[colName] || 'object';
    const isNumeric = colType === 'int64' || colType === 'float64';

    // 1. Calculate Descriptive Stats
    const getColumnStats = (targetColName) => {
      if (!targetColName || !rows || rows.length === 0) return null;
      const vals = rows.map(r => r[targetColName]);
      const totalSize = vals.length;
      const missingCount = vals.filter(v => v === null || v === undefined || String(v).trim() === '' || String(v).toLowerCase() === 'null').length;
      const missingPercent = totalSize > 0 ? ((missingCount / totalSize) * 100).toFixed(2) : '0.00';

      const validVals = vals.filter(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null');
      const uniqueVals = Array.from(new Set(validVals));
      const distinctCount = uniqueVals.length;
      const distinctPercent = totalSize > 0 ? ((distinctCount / totalSize) * 100).toFixed(2) : '0.00';

      // Frequencies
      const freqMap = {};
      validVals.forEach(v => {
        freqMap[v] = (freqMap[v] || 0) + 1;
      });
      const sortedFreqs = Object.entries(freqMap)
        .map(([val, count]) => ({
          val,
          count,
          percent: totalSize > 0 ? ((count / totalSize) * 100).toFixed(2) : '0.00'
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const targetType = types?.[targetColName] || 'object';
      const targetIsNumeric = targetType === 'int64' || targetType === 'float64';

      if (targetIsNumeric) {
        const numVals = validVals.map(Number).filter(v => !isNaN(v));
        const N = numVals.length;
        if (N === 0) {
          return {
            isNumeric: true,
            size: totalSize,
            distinct: distinctCount,
            distinctPercent,
            missing: missingCount,
            missingPercent,
            mean: 'N/A',
            median: 'N/A',
            sum: 'N/A',
            sd: 'N/A',
            skewness: 'N/A',
            minimum: 'N/A',
            maximum: 'N/A',
            zeros: 0,
            zerosPercent: '0.00',
            quantiles: { min: 'N/A', p5: 'N/A', q1: 'N/A', median: 'N/A', q3: 'N/A', p95: 'N/A', max: 'N/A' },
            sortedFreqs
          };
        }

        numVals.sort((a, b) => a - b);

        const sum = numVals.reduce((a, b) => a + b, 0);
        const mean = sum / N;
        const median = N % 2 === 1 ? numVals[Math.floor(N / 2)] : (numVals[N / 2 - 1] + numVals[N / 2]) / 2;

        const sqDiffSum = numVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        const sd = Math.sqrt(sqDiffSum / Math.max(1, N - 1));

        // skewness
        let skewness = 0;
        if (N > 2 && sd > 0) {
          const cubedSum = numVals.reduce((a, b) => a + Math.pow((b - mean) / sd, 3), 0);
          skewness = (N / ((N - 1) * (N - 2))) * cubedSum;
        }

        const minimum = numVals[0];
        const maximum = numVals[N - 1];
        const zerosCount = numVals.filter(v => v === 0).length;
        const zerosPercent = totalSize > 0 ? ((zerosCount / totalSize) * 100).toFixed(2) : '0.00';

        const getQuantile = (q) => {
          const idx = q * (N - 1);
          const low = Math.floor(idx);
          const high = Math.ceil(idx);
          if (low === high) return numVals[low];
          return numVals[low] + (idx - low) * (numVals[high] - numVals[low]);
        };

        const quantiles = {
          min: minimum.toFixed(2),
          p5: getQuantile(0.05).toFixed(2),
          q1: getQuantile(0.25).toFixed(2),
          median: median.toFixed(2),
          q3: getQuantile(0.75).toFixed(2),
          p95: getQuantile(0.95).toFixed(2),
          max: maximum.toFixed(2)
        };

        return {
          isNumeric: true,
          size: totalSize,
          distinct: distinctCount,
          distinctPercent,
          missing: missingCount,
          missingPercent,
          mean: mean.toFixed(2),
          median: median.toFixed(2),
          sum: sum.toFixed(2),
          sd: sd.toFixed(2),
          skewness: skewness.toFixed(2),
          minimum: minimum.toFixed(2),
          maximum: maximum.toFixed(2),
          zeros: zerosCount,
          zerosPercent,
          quantiles,
          sortedFreqs,
          rawValues: numVals
        };
      } else {
        return {
          isNumeric: false,
          size: totalSize,
          distinct: distinctCount,
          distinctPercent,
          missing: missingCount,
          missingPercent,
          sortedFreqs,
          rawValues: validVals
        };
      }
    };

    const stats = getColumnStats(colName);

    // 2. Local Action Handlers
    const handleFileChange = (e) => {
      const fn = e.target.value;
      setActiveFilename(fn);
      if (uploadedFiles[fn]) {
        const { headers } = uploadedFiles[fn];
        setPreprocessSelectedCol(headers[0] || '');
        setPreprocessPreviewState(null);
      }
    };

    const handleDeleteColumn = () => {
      if (!activeFilename || !uploadedFiles[activeFilename] || !colName) return;
      if (!confirm(`선택한 컬럼 [${colName}]을 데이터셋에서 삭제하시겠습니까?`)) return;

      const updatedHeaders = headers.filter(h => h !== colName);
      const updatedRows = rows.map(r => {
        const copy = { ...r };
        delete copy[colName];
        return copy;
      });
      const updatedTypes = { ...types };
      delete updatedTypes[colName];

      setUploadedFiles(prev => ({
        ...prev,
        [activeFilename]: {
          headers: updatedHeaders,
          rows: updatedRows,
          types: updatedTypes
        }
      }));

      setPreprocessSelectedCol(updatedHeaders[0] || '');
      setPreprocessPreviewState(null);
    };

    const handleSaveProcessedDataset = () => {
      if (!activeFilename || !uploadedFiles[activeFilename]) return;

      let newFilename = activeFilename;
      if (!newFilename.includes('_processed.csv')) {
        newFilename = newFilename.replace('.csv', '') + '_processed.csv';
      }

      setUploadedFiles(prev => ({
        ...prev,
        [newFilename]: {
          headers: [...headers],
          rows: [...rows],
          types: { ...types }
        }
      }));

      setActiveFilename(newFilename);
      alert(`데이터 가공 성공!\n새로운 데이터셋 [${newFilename}]이 생성되어 로드되었습니다.`);
    };

    const handlePreview = (toolType) => {
      let previewRows = [];
      let allRows = [];

      if (toolType === 'imputer') {
        const validVals = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null');
        let fillVal = '';
        if (prepImputerStrategy === 'most_frequent') {
          const counts = {};
          validVals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
          let maxC = -1;
          Object.entries(counts).forEach(([val, c]) => {
            if (c > maxC) {
              maxC = c;
              fillVal = val;
            }
          });
        } else if (prepImputerStrategy === 'mean' && isNumeric) {
          const nums = validVals.map(Number);
          fillVal = nums.length > 0 ? (nums.reduce((a,b)=>a+b, 0) / nums.length).toFixed(4) : '0';
        } else if (prepImputerStrategy === 'median' && isNumeric) {
          const nums = validVals.map(Number).sort((a,b)=>a-b);
          if (nums.length > 0) {
            const mid = Math.floor(nums.length / 2);
            fillVal = nums.length % 2 === 1 ? nums[mid].toFixed(4) : ((nums[mid-1]+nums[mid])/2).toFixed(4);
          } else {
            fillVal = '0';
          }
        } else if (prepImputerStrategy === 'constant') {
          fillVal = isNumeric ? '0' : 'missing';
        }

        // Find missing rows
        rows.forEach((r, idx) => {
          const val = r[colName];
          const isMissing = val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null';
          if (isMissing) {
            previewRows.push({
              index: idx, // 0-based for internal, will render index + 1 or index
              before: 'null',
              after: fillVal
            });
          }
        });

        // If no missing rows, take first 10 rows and simulate imputation
        if (previewRows.length === 0) {
          rows.slice(0, 10).forEach((r, idx) => {
            previewRows.push({
              index: idx,
              before: r[colName] || 'null',
              after: r[colName] || fillVal
            });
          });
        }

        allRows = rows.map((r, idx) => {
          const val = r[colName];
          const isMissing = val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null';
          return {
            index: idx,
            value: isMissing ? fillVal : val
          };
        });

        setPreprocessPreviewState({
          toolName: '결측값 대체',
          colName,
          suffix: '_IM',
          strategy: prepImputerStrategy,
          rows: previewRows.slice(0, 15),
          allRows
        });

      } else if (toolType === 'scaler') {
        if (!isNumeric) return;
        const numVals = rows.map(r => Number(r[colName])).filter(v => !isNaN(v));
        if (numVals.length === 0) return;

        const min = Math.min(...numVals);
        const max = Math.max(...numVals);
        const mean = numVals.reduce((a,b)=>a+b, 0) / numVals.length;
        const sd = Math.sqrt(numVals.reduce((a,b)=>a+Math.pow(b-mean,2), 0) / numVals.length) || 1;

        rows.slice(0, 15).forEach((r, idx) => {
          const val = Number(r[colName]);
          let scaled = val;
          if (!isNaN(val)) {
            if (prepScaleStrategy === 'Min-Max Scaler') {
              scaled = max !== min ? (val - min) / (max - min) : 0;
            } else {
              scaled = (val - mean) / sd;
            }
          }
          previewRows.push({
            index: idx,
            before: r[colName] || 'null',
            after: scaled.toFixed(4)
          });
        });

        allRows = rows.map((r, idx) => {
          const val = Number(r[colName]);
          let scaled = val;
          if (!isNaN(val)) {
            if (prepScaleStrategy === 'Min-Max Scaler') {
              scaled = max !== min ? (val - min) / (max - min) : 0;
            } else {
              scaled = (val - mean) / sd;
            }
          }
          return {
            index: idx,
            value: scaled.toFixed(4)
          };
        });

        setPreprocessPreviewState({
          toolName: 'Scale 조정',
          colName,
          suffix: '_SC',
          strategy: prepScaleStrategy,
          rows: previewRows,
          allRows
        });

      } else if (toolType === 'transformer') {
        if (isNumeric) {
          const transTool = prepTransTool || 'quantile_transformer';
          const numVals = rows.map(r => Number(r[colName])).filter(v => !isNaN(v));
          if (numVals.length === 0) return;

          if (transTool === 'quantile_transformer') {
            const sorted = [...numVals].sort((a,b)=>a-b);
            rows.slice(0, 15).forEach((r, idx) => {
              const val = Number(r[colName]);
              let transVal = 0.5;
              if (!isNaN(val)) {
                const rank = sorted.indexOf(val);
                transVal = rank / Math.max(1, sorted.length - 1);
              }
              previewRows.push({
                index: idx,
                before: r[colName] || 'null',
                after: transVal.toFixed(4)
              });
            });

            allRows = rows.map((r, idx) => {
              const val = Number(r[colName]);
              let transVal = 0.5;
              if (!isNaN(val)) {
                const rank = sorted.indexOf(val);
                transVal = rank / Math.max(1, sorted.length - 1);
              }
              return {
                index: idx,
                value: transVal.toFixed(4)
              };
            });
          } else if (transTool === 'kbins_discretizer') {
            const min = Math.min(...numVals);
            const max = Math.max(...numVals);
            const bins = prepNQuantiles || 10;
            const binSize = (max - min) / bins;

            rows.slice(0, 15).forEach((r, idx) => {
              const val = Number(r[colName]);
              let bin = 0;
              if (!isNaN(val)) {
                bin = Math.min(bins - 1, Math.floor((val - min) / Math.max(0.0001, binSize)));
              }
              previewRows.push({
                index: idx,
                before: r[colName] || 'null',
                after: String(bin)
              });
            });

            allRows = rows.map((r, idx) => {
              const val = Number(r[colName]);
              let bin = 0;
              if (!isNaN(val)) {
                bin = Math.min(bins - 1, Math.floor((val - min) / Math.max(0.0001, binSize)));
              }
              return {
                index: idx,
                value: String(bin)
              };
            });
          } else {
            // numeric_transformer
            rows.slice(0, 15).forEach((r, idx) => {
              const val = Number(r[colName]);
              const transVal = !isNaN(val) ? Math.log1p(Math.abs(val)) : 0;
              previewRows.push({
                index: idx,
                before: r[colName] || 'null',
                after: transVal.toFixed(4)
              });
            });

            allRows = rows.map((r, idx) => {
              const val = Number(r[colName]);
              const transVal = !isNaN(val) ? Math.log1p(Math.abs(val)) : 0;
              return {
                index: idx,
                value: transVal.toFixed(4)
              };
            });
          }

          setPreprocessPreviewState({
            toolName: '데이터 변환',
            colName,
            suffix: '_EN',
            strategy: transTool,
            rows: previewRows,
            allRows
          });
        } else {
          // Categorical Trans
          const transTool = prepTransTool || 'ordinal_encoder';
          const uniqueVals = Array.from(new Set(rows.map(r => r[colName]).filter(v => v !== null && v !== undefined && String(v).trim() !== '')));

          rows.slice(0, 15).forEach((r, idx) => {
            const val = r[colName];
            let transVal = '';
            if (transTool === 'ordinal_encoder') {
              const code = uniqueVals.indexOf(val);
              transVal = String(code >= 0 ? code : 0);
            } else {
              // One-hot dummy demo
              transVal = val === uniqueVals[0] ? '1' : '0';
            }
            previewRows.push({
              index: idx,
              before: val || 'null',
              after: transVal
            });
          });

          allRows = rows.map((r, idx) => {
            const val = r[colName];
            let transVal = '';
            if (transTool === 'ordinal_encoder') {
              const code = uniqueVals.indexOf(val);
              transVal = String(code >= 0 ? code : 0);
            } else {
              transVal = val === uniqueVals[0] ? '1' : '0';
            }
            return {
              index: idx,
              value: transVal
            };
          });

          setPreprocessPreviewState({
            toolName: '데이터 변환',
            colName,
            suffix: '_EN',
            strategy: transTool,
            rows: previewRows,
            allRows
          });
        }

      } else if (toolType === 'filter') {
        rows.slice(0, 15).forEach((r, idx) => {
          const val = r[colName];
          const isMissing = val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null';
          previewRows.push({
            index: idx,
            before: val || 'null',
            after: isMissing ? 'Filtered' : val
          });
        });

        allRows = rows.map((r, idx) => {
          const val = r[colName];
          const isMissing = val === null || val === undefined || String(val).trim() === '' || String(val).toLowerCase() === 'null';
          return {
            index: idx,
            value: isMissing ? '' : val
          };
        });

        setPreprocessPreviewState({
          toolName: '데이터 필터링',
          colName,
          suffix: '_FI',
          strategy: 'missing_filter',
          rows: previewRows,
          allRows
        });

      } else if (toolType === 'regex') {
        if (isNumeric) return;
        let regex;
        try {
          regex = new RegExp(prepRegexPattern);
        } catch (e) {
          regex = /(.*)/;
        }

        rows.slice(0, 15).forEach((r, idx) => {
          const val = String(r[colName] || '');
          const match = val.match(regex);
          const extracted = match ? (match[1] || match[0]) : '';
          previewRows.push({
            index: idx,
            before: val,
            after: extracted
          });
        });

        allRows = rows.map((r, idx) => {
          const val = String(r[colName] || '');
          const match = val.match(regex);
          return {
            index: idx,
            value: match ? (match[1] || match[0]) : ''
          };
        });

        setPreprocessPreviewState({
          toolName: 'Regex 추출',
          colName,
          suffix: '_RE',
          strategy: prepRegexPattern,
          rows: previewRows,
          allRows
        });

      } else if (toolType === 'nlp') {
        if (isNumeric) return;
        rows.slice(0, 15).forEach((r, idx) => {
          const val = String(r[colName] || '');
          const tokens = val.split(/[\s_]+/).filter(Boolean).slice(0, 3).join(', ');
          previewRows.push({
            index: idx,
            before: val,
            after: tokens || 'None'
          });
        });

        allRows = rows.map((r, idx) => {
          const val = String(r[colName] || '');
          const tokens = val.split(/[\s_]+/).filter(Boolean).slice(0, 3).join(', ');
          return {
            index: idx,
            value: tokens
          };
        });

        setPreprocessPreviewState({
          toolName: '자연어 처리',
          colName,
          suffix: '_NLP',
          strategy: '형태소 분석',
          rows: previewRows,
          allRows
        });
      }
    };

    const handleApplyPreprocess = () => {
      if (!preprocessPreviewState) return;
      const { suffix, allRows, toolName } = preprocessPreviewState;
      const newColName = `${colName}${suffix}`;

      let updatedHeaders = [...headers];
      if (!updatedHeaders.includes(newColName)) {
        const origIdx = updatedHeaders.indexOf(colName);
        if (origIdx >= 0) {
          updatedHeaders.splice(origIdx + 1, 0, newColName);
        } else {
          updatedHeaders.push(newColName);
        }
      }

      const updatedRows = rows.map((r, idx) => {
        const match = allRows.find(item => item.index === idx);
        return {
          ...r,
          [newColName]: match ? match.value : r[colName]
        };
      });

      const newColType = suffix === '_IM' || suffix === '_FI' || suffix === '_RE' || suffix === '_NLP'
        ? (types?.[colName] || 'object')
        : (suffix === '_SC' ? 'float64' : 'int64');

      const updatedTypes = {
        ...types,
        [newColName]: newColType
      };

      setUploadedFiles(prev => ({
        ...prev,
        [activeFilename]: {
          headers: updatedHeaders,
          rows: updatedRows,
          types: updatedTypes
        }
      }));

      setPreprocessToast({
        show: true,
        message1: `${colName} 컬럼 결측치 처리가 완료되었습니다.`,
        message2: `적용 시 ${newColName} 컬럼이 추가됩니다.`
      });

      setTimeout(() => {
        setPreprocessToast(prev => ({ ...prev, show: false }));
      }, 4000);
    };

    // 3. SVG Chart Render
    const renderPreprocessChart = (chartStats, targetColName) => {
      if (!chartStats) return null;

      const width = 450;
      const height = 150;
      const paddingLeft = 50;
      const paddingRight = 20;
      const paddingTop = 15;
      const paddingBottom = 25;

      const chartWidth = width - paddingLeft - paddingRight;
      const chartHeight = height - paddingTop - paddingBottom;

      if (chartStats.isNumeric) {
        const raw = chartStats.rawValues || [];
        if (raw.length === 0) return null;

        const min = Math.min(...raw);
        const max = Math.max(...raw);
        const binCount = 10;
        const binWidth = (max - min) / binCount;
        const bins = Array(binCount).fill(0);
        const binLabels = [];

        for (let i = 0; i < binCount; i++) {
          const binMin = min + i * binWidth;
          const binMax = min + (i + 1) * binWidth;
          binLabels.push(`${binMin.toFixed(0)}`);

          raw.forEach(v => {
            if (i === binCount - 1) {
              if (v >= binMin && v <= binMax) bins[i]++;
            } else {
              if (v >= binMin && v < binMax) bins[i]++;
            }
          });
        }
        binLabels.push(`${max.toFixed(0)}`);

        const maxBinVal = Math.max(...bins) || 1;
        const barWidth = chartWidth / binCount;

        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* SVG Toolbar mock icons */}
            <div style={{ position: 'absolute', top: 0, right: 10, display: 'flex', gap: '8px', opacity: 0.5 }}>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>📥</span>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>🖼️</span>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>🔍</span>
            </div>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = paddingTop + chartHeight * (1 - ratio);
                const val = Math.round(maxBinVal * ratio);
                return (
                  <g key={idx}>
                    <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f0f0f0" strokeDasharray="3,3" />
                    <text x={paddingLeft - 8} y={y + 4} fontSize="8" fill="#999" textAnchor="end">{val}</text>
                  </g>
                );
              })}

              {/* Bars */}
              {bins.map((count, idx) => {
                const barHeight = (count / maxBinVal) * chartHeight;
                const x = paddingLeft + idx * barWidth + 2;
                const y = paddingTop + chartHeight - barHeight;
                const w = barWidth - 4;
                return (
                  <g key={idx}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={barHeight}
                      fill="#5c7cfa"
                      rx="1"
                      style={{ transition: 'all 0.3s', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredBin({ index: idx, count, label: `${(min + idx * binWidth).toFixed(1)}~${(min + (idx + 1) * binWidth).toFixed(1)}` })}
                      onMouseLeave={() => setHoveredBin(null)}
                    />
                    {hoveredBin?.index === idx && (
                      <text x={x + w/2} y={y - 4} fontSize="8" fontWeight="bold" fill="#333" textAnchor="middle">{count}</text>
                    )}
                  </g>
                );
              })}

              {/* X Axis Labels */}
              {binLabels.map((lbl, idx) => {
                if (idx % 2 !== 0 && idx !== binLabels.length - 1) return null;
                const x = paddingLeft + (idx * (chartWidth / binCount));
                return (
                  <text key={idx} x={x} y={height - 5} fontSize="8" fill="#999" textAnchor="middle">{lbl}</text>
                );
              })}

              {/* Axis title */}
              <text x={paddingLeft + chartWidth / 2} y={height - 15} fontSize="9" fill="#555" textAnchor="middle" fontWeight="bold">{targetColName}</text>
            </svg>
          </div>
        );
      } else {
        // Horizontal bar chart for categorical
        const data = chartStats.sortedFreqs || [];
        const maxCount = Math.max(...data.map(d => d.count)) || 1;
        const barHeight = chartHeight / Math.max(1, data.length);

        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* SVG Toolbar mock icons */}
            <div style={{ position: 'absolute', top: 0, right: 10, display: 'flex', gap: '8px', opacity: 0.5 }}>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>📥</span>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>🖼️</span>
              <span style={{ fontSize: '0.65rem', cursor: 'pointer' }}>🔍</span>
            </div>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
              {/* Grid lines (vertical) */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const x = paddingLeft + chartWidth * ratio;
                const val = Math.round(maxCount * ratio);
                return (
                  <g key={idx}>
                    <line x1={x} y1={paddingTop} x2={x} y2={height - paddingBottom} stroke="#f0f0f0" strokeDasharray="3,3" />
                    <text x={x} y={height - 12} fontSize="8" fill="#999" textAnchor="middle">{val}</text>
                  </g>
                );
              })}

              {/* Bars */}
              {data.map((item, idx) => {
                const barWidth = (item.count / maxCount) * chartWidth;
                const x = paddingLeft;
                const y = paddingTop + idx * barHeight + 3;
                const h = barHeight - 6;
                return (
                  <g key={idx}>
                    <text x={paddingLeft - 8} y={y + h/2 + 3} fontSize="8" fill="#555" textAnchor="end" fontWeight="bold">
                      {item.val.length > 8 ? item.val.slice(0, 7) + '..' : item.val}
                    </text>

                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={h}
                      fill="#7048e8"
                      rx="1"
                      style={{ transition: 'all 0.3s' }}
                    />

                    <text x={x + barWidth + 5} y={y + h/2 + 3} fontSize="8" fill="#777">{item.count}</text>
                  </g>
                );
              })}

              {/* Axis title */}
              <text x={paddingLeft + chartWidth / 2} y={height - 2} fontSize="9" fill="#555" textAnchor="middle" fontWeight="bold">count</text>
            </svg>
          </div>
        );
      }
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', position: 'relative', backgroundColor: '#f8f9fa' }}>
        {/* Floating Toast Notification */}
        {preprocessToast.show && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: '#0f59f4',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            minWidth: '280px',
            maxWidth: '350px',
            fontSize: '0.8rem',
            animation: 'fadeIn 0.3s'
          }}>
            <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold' }}>{preprocessToast.message1}</div>
              <div style={{ opacity: 0.9, marginTop: '2px', fontSize: '0.75rem' }}>{preprocessToast.message2}</div>
            </div>
            <button
              onClick={() => setPreprocessToast({ show: false, message1: '', message2: '' })}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8, padding: 0, fontSize: '1rem', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
        )}

        {/* 1열: 가공 설정 (Left Settings Panel) */}
        <div style={{ width: '260px', borderRight: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', flexShrink: 0 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>가공 설정</h3>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#475569' }}>작업 데이터 선택</label>
            <select
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', backgroundColor: 'white' }}
              value={activeFilename}
              onChange={handleFileChange}
            >
              {Object.keys(uploadedFiles).map(fn => (
                <option key={fn} value={fn}>{fn}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: 0, color: '#475569' }}>컬럼 선택</label>
              <button
                type="button"
                onClick={handleDeleteColumn}
                disabled={!colName}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: colName ? 'pointer' : 'not-allowed', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="컬럼 삭제"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#f8fafc' }}>
              {headers.map(h => {
                const isSelected = h === colName;
                const type = types?.[h] || 'object';
                let badgeBg = '#f1f5f9';
                let badgeColor = '#475569';

                if (type === 'object') {
                  badgeBg = '#e0f2fe';
                  badgeColor = '#0284c7';
                } else if (type === 'int64') {
                  badgeBg = '#dcfce7';
                  badgeColor = '#16a34a';
                } else if (type === 'float64') {
                  badgeBg = '#fef3c7';
                  badgeColor = '#d97706';
                }

                return (
                  <div
                    key={h}
                    onClick={() => {
                      setPreprocessSelectedCol(h);
                      setPreprocessPreviewState(null);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#eff6ff' : 'white',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#1d4ed8' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {h}
                    </span>
                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: badgeBg, color: badgeColor, fontWeight: '500' }}>
                      {type}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '6px', padding: '0 4px' }}>
              <span>총 {headers.length}</span>
              <span>최소 1 / 최대 1</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={handleSaveProcessedDataset}
            style={{ fontSize: '0.8rem', padding: '10px 0', borderRadius: '4px', fontWeight: 'bold' }}
          >
            가공데이터 저장
          </button>
        </div>

        {/* 2열: 가공 도구 (Center Preprocessing Workspace) */}
        <div style={{ width: '270px', borderRight: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', flexShrink: 0, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>가공 도구</h3>

          {/* Conditional Tool Options card rendering */}
          {isNumeric ? (
            // Numeric Preprocessing Workspace
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 결측값 대체 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>결측값 대체</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '8px' }}
                  value={prepImputerTool}
                  onChange={(e) => setPrepImputerTool(e.target.value)}
                >
                  <option value="basic_imputer">basic_imputer</option>
                </select>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>strategy</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepImputerStrategy}
                  onChange={(e) => setPrepImputerStrategy(e.target.value)}
                >
                  <option value="most_frequent">most_frequent</option>
                  <option value="median">median</option>
                  <option value="mean">mean</option>
                  <option value="constant">constant</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('imputer')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* Scale 조정 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>Scale 조정</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '8px' }}
                  value={prepScaleTool}
                  onChange={(e) => setPrepScaleTool(e.target.value)}
                >
                  <option value="basic_scaler">basic_scaler</option>
                </select>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>strategy</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepScaleStrategy}
                  onChange={(e) => setPrepScaleStrategy(e.target.value)}
                >
                  <option value="Min-Max Scaler">Min-Max Scaler</option>
                  <option value="Standard Scaler">Standard Scaler</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('scaler')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* 데이터 변환 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>데이터 변환</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '8px' }}
                  value={prepTransTool || 'quantile_transformer'}
                  onChange={(e) => setPrepTransTool(e.target.value)}
                >
                  <option value="quantile_transformer">quantile_transformer</option>
                  <option value="numeric_transformer">numeric_transformer</option>
                  <option value="kbins_discretizer">kbins_discretizer</option>
                </select>

                {(prepTransTool === 'quantile_transformer' || !prepTransTool) && (
                  <>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>strategy</div>
                    <select
                      style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '8px' }}
                      value={prepTransStrategy}
                      onChange={(e) => setPrepTransStrategy(e.target.value)}
                    >
                      <option value="uniform">uniform</option>
                      <option value="normal">normal</option>
                    </select>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>n_quantiles</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        style={{ flex: 1 }}
                        value={prepNQuantiles}
                        onChange={(e) => setPrepNQuantiles(Number(e.target.value))}
                      />
                      <span style={{ fontSize: '0.7rem', color: '#475569', width: '30px', textAlign: 'right' }}>{prepNQuantiles}</span>
                    </div>
                  </>
                )}

                {prepTransTool === 'kbins_discretizer' && (
                  <>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>n_bins</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <input
                        type="range"
                        min="2"
                        max="20"
                        style={{ flex: 1 }}
                        value={prepNQuantiles}
                        onChange={(e) => setPrepNQuantiles(Number(e.target.value))}
                      />
                      <span style={{ fontSize: '0.7rem', color: '#475569', width: '20px', textAlign: 'right' }}>{prepNQuantiles}</span>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('transformer')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* 데이터 필터링 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>데이터 필터링 <span style={{ color: '#94a3b8', cursor: 'help' }} title="결측값이 들어 있는 레코드를 조건별로 필터링합니다.">?</span></div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '12px' }}
                  value={prepFilterTool}
                  onChange={(e) => setPrepFilterTool(e.target.value)}
                >
                  <option value="missing_filter">missing_filter</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('filter')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Categorical Preprocessing Workspace
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 결측값 대체 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>결측값 대체</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '8px' }}
                  value={prepImputerTool}
                  onChange={(e) => setPrepImputerTool(e.target.value)}
                >
                  <option value="basic_imputer">basic_imputer</option>
                </select>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>strategy</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepImputerStrategy}
                  onChange={(e) => setPrepImputerStrategy(e.target.value)}
                >
                  <option value="most_frequent">most_frequent</option>
                  <option value="constant">constant</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('imputer')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* 데이터 변환 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>데이터 변환</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepTransTool || 'ordinal_encoder'}
                  onChange={(e) => setPrepTransTool(e.target.value)}
                >
                  <option value="ordinal_encoder">ordinal_encoder</option>
                  <option value="onehot_encoder">onehot_encoder</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('transformer')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* 데이터 필터링 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>데이터 필터링 <span style={{ color: '#94a3b8', cursor: 'help' }} title="결측값이 들어 있는 레코드를 조건별로 필터링합니다.">?</span></div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '12px' }}
                  value={prepFilterTool}
                  onChange={(e) => setPrepFilterTool(e.target.value)}
                >
                  <option value="missing_filter">missing_filter</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('filter')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* Regex 추출 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>Regex 추출</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '8px' }}
                  value={prepRegexTool}
                  onChange={(e) => setPrepRegexTool(e.target.value)}
                >
                  <option value="Regex">Regex</option>
                </select>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>patterns</div>
                <input
                  type="text"
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepRegexPattern}
                  onChange={(e) => setPrepRegexPattern(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('regex')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>

              {/* 자연어 처리 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: 'white' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>자연어 처리</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', marginBottom: '8px' }}
                  value={prepNlpTool}
                  onChange={(e) => setPrepNlpTool(e.target.value)}
                >
                  <option value="pecab">pecab</option>
                </select>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '4px' }}>strategy</div>
                <select
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: 'white', marginBottom: '12px' }}
                  value={prepNlpStrategy}
                  onChange={(e) => setPrepNlpStrategy(e.target.value)}
                >
                  <option value="형태소 분석">형태소 분석</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handlePreview('nlp')}
                    style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: 'white', borderRadius: '4px', padding: '2px 14px', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    보기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3열: 가공 결과 & 시각화 워크스페이스 (Right Panel) */}
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, overflowY: 'auto' }}>
          
          {/* 상단: 통계 정보 및 차트 */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', backgroundColor: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b' }}>동계 정보</span>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 'bold' }}>
                대상 컬럼: {colName}
              </span>
            </div>

            {stats ? (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'nowrap', overflowX: 'auto', width: '100%' }}>
                {stats.isNumeric ? (
                  <>
                    {/* 1-1) 기술통계 표 Left (헤더 1 + 데이터 7 = 8행) */}
                    <div style={{ flex: '1 1 0px', minWidth: '125px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>기술통계</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>값</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'size', val: stats.size?.toLocaleString() },
                            { label: 'distinct', val: stats.distinct?.toLocaleString() },
                            { label: 'distinct(%)', val: stats.distinctPercent },
                            { label: 'missing', val: stats.missing?.toLocaleString() },
                            { label: 'missing(%)', val: stats.missingPercent },
                            { label: 'zeros', val: stats.zeros?.toLocaleString() },
                            { label: 'zeros(%)', val: stats.zerosPercent }
                          ].map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === 6 ? 'none' : '1px solid #e2e8f0' }}>
                              <td style={{ height: '25px', padding: '0 8px', color: '#475569' }}>{row.label}</td>
                              <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold' }}>{row.val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 1-2) 기술통계 표 Right (헤더 1 + 데이터 7 = 8행) */}
                    <div style={{ flex: '1 1 0px', minWidth: '125px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>항목</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>값</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'mean', val: stats.mean },
                            { label: 'median', val: stats.median },
                            { label: 'sum', val: Number(stats.sum || 0).toLocaleString() },
                            { label: 'sd', val: stats.sd },
                            { label: 'skewness', val: stats.skewness },
                            { label: 'minimum', val: stats.minimum },
                            { label: 'maximum', val: stats.maximum }
                          ].map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === 6 ? 'none' : '1px solid #e2e8f0' }}>
                              <td style={{ height: '25px', padding: '0 8px', color: '#475569' }}>{row.label}</td>
                              <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold' }}>{row.val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 2) 분위수 표 (헤더 1 + 데이터 7 = 8행) */}
                    {stats.quantiles && (
                      <div style={{ flex: '1 1 0px', minWidth: '125px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                              <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>분위수</th>
                              <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>값</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: 'min', val: stats.quantiles.min },
                              { label: '5th_per', val: stats.quantiles.p5 },
                              { label: 'q1', val: stats.quantiles.q1 },
                              { label: 'median', val: stats.quantiles.median },
                              { label: 'q3', val: stats.quantiles.q3 },
                              { label: '95th_per', val: stats.quantiles.p95 },
                              { label: 'max', val: stats.quantiles.max }
                            ].map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: idx === 6 ? 'none' : '1px solid #e2e8f0' }}>
                                <td style={{ height: '25px', padding: '0 8px', color: '#475569' }}>{row.label}</td>
                                <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold' }}>{row.val}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 3) 최빈값 (상위 5개) 표 (헤더 1 + 데이터 7 = 8행으로 패딩) */}
                    <div style={{ flex: '1.2 1 0px', minWidth: '170px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>최빈값 (상위 5개)</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>빈도</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>비율</th>
                            <th style={{ height: '25px', padding: '0 4px', textAlign: 'center', width: '20px', color: '#475569' }}>🔍</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const freqData = stats.sortedFreqs || [];
                            const padded = [...freqData];
                            while (padded.length < 7) {
                              padded.push({ val: '', count: '', percent: '', isEmpty: true });
                            }
                            return padded.map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: idx === 6 ? 'none' : '1px solid #e2e8f0' }}>
                                <td style={{ height: '25px', padding: '0 8px', color: '#1e293b', fontWeight: item.isEmpty ? 'normal' : 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={item.val}>
                                  {item.isEmpty ? '\u00A0' : item.val}
                                </td>
                                <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', color: '#475569' }}>
                                  {item.isEmpty ? '\u00A0' : item.count?.toLocaleString()}
                                </td>
                                <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', color: '#475569' }}>
                                  {item.isEmpty ? '\u00A0' : `${item.percent}%`}
                                </td>
                                <td style={{ height: '25px', padding: '0 4px', textAlign: 'center', color: '#94a3b8' }}></td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* 4) SVG Chart */}
                    <div style={{ flex: '1.8 1 0px', height: '200px', minWidth: '260px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px', backgroundColor: 'white', display: 'flex', alignItems: 'center' }}>
                      {renderPreprocessChart(stats, colName)}
                    </div>
                  </>
                ) : (
                  <>
                    {/* 범주형 컬럼인 경우 */}
                    {/* 1) 기술통계 표 Left (헤더 1 + 데이터 5 = 6행) */}
                    <div style={{ flex: '1 1 0px', minWidth: '150px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>기술통계</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>값</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'size', val: stats.size?.toLocaleString() },
                            { label: 'distinct', val: stats.distinct?.toLocaleString() },
                            { label: 'distinct(%)', val: stats.distinctPercent },
                            { label: 'missing', val: stats.missing?.toLocaleString() },
                            { label: 'missing(%)', val: stats.missingPercent }
                          ].map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === 4 ? 'none' : '1px solid #e2e8f0' }}>
                              <td style={{ height: '25px', padding: '0 8px', color: '#475569' }}>{row.label}</td>
                              <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold' }}>{row.val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 2) 최빈값 (상위 5개) 표 (헤더 1 + 데이터 5 = 6행) */}
                    <div style={{ flex: '1.2 1 0px', minWidth: '180px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', border: '1px solid #cbd5e1', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>최빈값 (상위 5개)</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>빈도</th>
                            <th style={{ height: '25px', padding: '0 8px', textAlign: 'right', fontWeight: 'bold', color: '#475569', fontSize: '0.68rem' }}>비율</th>
                            <th style={{ height: '25px', padding: '0 4px', textAlign: 'center', width: '20px', color: '#475569' }}>🔍</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const freqData = stats.sortedFreqs || [];
                            const padded = [...freqData];
                            while (padded.length < 5) {
                              padded.push({ val: '', count: '', percent: '', isEmpty: true });
                            }
                            return padded.map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: idx === 4 ? 'none' : '1px solid #e2e8f0' }}>
                                <td style={{ height: '25px', padding: '0 8px', color: '#1e293b', fontWeight: item.isEmpty ? 'normal' : 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={item.val}>
                                  {item.isEmpty ? '\u00A0' : item.val}
                                </td>
                                <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', color: '#475569' }}>
                                  {item.isEmpty ? '\u00A0' : item.count?.toLocaleString()}
                                </td>
                                <td style={{ height: '25px', padding: '0 8px', textAlign: 'right', color: '#475569' }}>
                                  {item.isEmpty ? '\u00A0' : `${item.percent}%`}
                                </td>
                                <td style={{ height: '25px', padding: '0 4px', textAlign: 'center', color: '#94a3b8' }}></td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* 3) SVG Chart */}
                    <div style={{ flex: '1.8 1 0px', height: '150px', minWidth: '260px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px', backgroundColor: 'white', display: 'flex', alignItems: 'center' }}>
                      {renderPreprocessChart(stats, colName)}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>데이터 로딩 실패 또는 데이터가 비어 있습니다.</div>
            )}
          </div>

          {/* 하단: 데이터 가공 결과 미리보기 테이블 */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', backgroundColor: 'white', flex: 1, minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b' }}>데이터 가공 결과</span>
              <button
                type="button"
                onClick={handleApplyPreprocess}
                disabled={!preprocessPreviewState}
                style={{
                  backgroundColor: preprocessPreviewState ? '#0f59f4' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 20px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: preprocessPreviewState ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                적용
              </button>
            </div>

            {!preprocessPreviewState ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                보기 버튼을 클릭하여 데이터 가공 결과를 확인하세요
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '8px', paddingBottom: '4px', borderBottom: '2px solid #3b82f6', width: 'fit-content' }}>
                  {preprocessPreviewState.toolName}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569' }}>Index</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569' }}>before_value</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569' }}>after_value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preprocessPreviewState.rows.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                          <td style={{ padding: '6px 12px', color: '#475569' }}>{row.index + 1}</td>
                          <td style={{ padding: '6px 12px', color: row.before === 'null' ? '#94a3b8' : '#1e293b', fontStyle: row.before === 'null' ? 'italic' : 'normal' }}>
                            {row.before}
                          </td>
                          <td style={{ padding: '6px 12px', color: '#0f59f4', fontWeight: 'bold' }}>{row.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Multiple Linear Regression gradient descent solver in Javascript
  const runLinearRegression = (X_cols, Y_col, dataRows) => {
    // Get numeric data
    const dataset = dataRows.map(r => {
      const row = { y: Number(r[Y_col]) };
      X_cols.forEach(x => { row[x] = Number(r[x]); });
      return row;
    }).filter(row => !isNaN(row.y) && X_cols.every(x => !isNaN(row[x])));
    
    if (dataset.length === 0) return null;
    
    const N = dataset.length;
    const Y_vals = dataset.map(d => d.y);
    const X_vals = dataset.map(d => X_cols.map(x => d[x]));
    
    // Mean of Y
    const meanY = Y_vals.reduce((a, b) => a + b, 0) / N;
    const meanX = X_cols.map((_, i) => X_vals.reduce((sum, row) => sum + row[i], 0) / N);
    
    // Gradient Descent solver
    let weights = X_cols.map(() => 0.0);
    let bias = meanY;
    const learningRate = 0.01;
    const epochs = 500;
    
    // Standardize for stable training
    const stdX = X_cols.map((_, i) => {
      const avg = meanX[i];
      const sqDiff = X_vals.reduce((sum, row) => sum + Math.pow(row[i] - avg, 2), 0);
      const sd = Math.sqrt(sqDiff / N) || 1;
      return { avg, sd };
    });
    const stdY = {
      avg: meanY,
      sd: Math.sqrt(Y_vals.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / N) || 1
    };
    
    // Normalized X & Y
    const normX = X_vals.map(row => row.map((val, i) => (val - stdX[i].avg) / stdX[i].sd));
    const normY = Y_vals.map(val => (val - stdY.avg) / stdY.sd);
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < N; i++) {
        const pred = normX[i].reduce((sum, val, idx) => sum + val * weights[idx], 0) + bias;
        const error = pred - normY[i];
        
        bias -= learningRate * error / N;
        weights = weights.map((w, idx) => w - learningRate * error * normX[i][idx] / N);
      }
    }
    
    // Denormalize weights
    const origWeights = X_cols.map((_, i) => weights[i] * stdY.sd / stdX[i].sd);
    const origBias = stdY.sd * (bias - X_cols.reduce((sum, _, i) => sum + weights[i] * stdX[i].avg / stdX[i].sd, 0)) + stdY.avg;
    
    // Calculate R2 Score & MSE
    let totalSqError = 0;
    let totalVarY = 0;
    for (let i = 0; i < N; i++) {
      const pred = X_vals[i].reduce((sum, val, idx) => sum + val * origWeights[idx], 0) + origBias;
      totalSqError += Math.pow(pred - Y_vals[i], 2);
      totalVarY += Math.pow(Y_vals[i] - meanY, 2);
    }
    const mse = totalSqError / N;
    const r2 = totalVarY > 0 ? (1 - (totalSqError / totalVarY)) : 1;
    
    return {
      coefficients: origWeights.map(w => Number(w.toFixed(4))),
      intercept: Number(origBias.toFixed(4)),
      r2: Number(Math.max(0, r2).toFixed(4)),
      mse: Number(mse.toFixed(4)),
      features: X_cols,
      target: Y_col
    };
  };

  const renderAiduModelTrainTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const fileData = uploadedFiles[activeFilename];
    const { headers } = fileData;

    const handleDataTypeChange = (type) => {
      setMlDataType(type);
      setMlSelectedModels([]);
      if (type === 'Categorical') {
        setMlModelType('Classification');
      }
    };

    // Determine ML Model options based on Selected Model Type
    const isClassification = mlModelType === 'Classification';
    const modelsList = isClassification
      ? [
          'Logistic Regression',
          'K Nearest Neighbor',
          'Decision Tree',
          'Random Forest',
          'Light Gradient Boosting Machine'
        ]
      : [
          'Linear Regression',
          'K Neighbors Regressor',
          'Decision Tree Regressor',
          'Random Forest Regressor',
          'Light Gradient Boosting Machine Regressor'
        ];

    // Align sorting metrics options
    const sortMetrics = isClassification
      ? ['Accuracy', 'AUC', 'Recall', 'Prec.', 'F1', 'Kappa', 'MCC']
      : ['R2', 'MAE', 'MSE', 'RMSE', 'MAPE', 'RMSLE'];

    // Variable Move Action Handlers
    const handleMoveToOutput = () => {
      if (!mlSelectedColInInput) return;
      
      const newOutput = mlSelectedColInInput;
      let newInputs = mlInputCols.filter(c => c !== newOutput);
      
      // If output is already filled, push it back to input
      if (mlOutputCol) {
        newInputs.push(mlOutputCol);
      }

      setMlOutputCol(newOutput);
      setMlInputCols(newInputs);
      setMlSelectedColInInput('');
      setMlSelectedColInOutput('');
    };

    const handleRemoveFromOutput = () => {
      if (!mlOutputCol) return;
      
      setMlInputCols([...mlInputCols, mlOutputCol]);
      setMlOutputCol('');
      setMlSelectedColInOutput('');
    };

    const handleMoveToExclude = () => {
      if (!mlSelectedColInInput) return;
      if (mlExcludeCols.length >= 1) {
        alert('제외 컬럼은 최대 1개만 설정 가능합니다.');
        return;
      }

      const newExclude = mlSelectedColInInput;
      setMlExcludeCols([...mlExcludeCols, newExclude]);
      setMlInputCols(mlInputCols.filter(c => c !== newExclude));
      setMlSelectedColInInput('');
    };

    const handleRemoveFromExclude = () => {
      if (mlExcludeCols.length === 0 || !mlSelectedColInExclude) return;

      const toRestore = mlSelectedColInExclude;
      setMlInputCols([...mlInputCols, toRestore]);
      setMlExcludeCols(mlExcludeCols.filter(c => c !== toRestore));
      setMlSelectedColInExclude('');
    };

    const handleModelToggle = (modelName) => {
      if (mlSelectedModels.includes(modelName)) {
        setMlSelectedModels(mlSelectedModels.filter(m => m !== modelName));
      } else {
        if (mlSelectedModels.length >= 5) {
          alert('최대 5개 모델까지 선택할 수 있습니다.');
          return;
        }
        setMlSelectedModels([...mlSelectedModels, modelName]);
      }
    };

    const handleMLTrainRun = () => {
      if (!mlOutputCol) {
        alert('Output 컬럼(종속 변수)을 지정해 주세요.');
        return;
      }
      if (mlSelectedModels.length === 0) {
        alert('학습에 사용할 ML 모델을 하나 이상 선택해 주세요.');
        return;
      }

      setMlIsTraining(true);
      setMlTrainResults(null);

      setTimeout(() => {
        // Generate simulated metrics
        const results = mlSelectedModels.map(model => {
          let code = '';
          if (model.includes('Random Forest')) code = 'rf';
          else if (model.includes('Boosting')) code = 'lightgbm';
          else if (model.includes('Logistic')) code = 'lr';
          else if (model.includes('Linear')) code = 'lr';
          else if (model.includes('Decision Tree')) code = 'dt';
          else if (model.includes('Neighbor')) code = 'knn';
          else code = 'model';

          if (isClassification) {
            // Accuracy, AUC, Recall, Prec., F1, Kappa, MCC, TT (Sec)
            const baseAcc = code === 'rf' ? 0.8766 : code === 'lightgbm' ? 0.8759 : code === 'lr' ? 0.8368 : code === 'dt' ? 0.8175 : 0.7943;
            const baseAuc = code === 'rf' ? 0.9366 : code === 'lightgbm' ? 0.9416 : code === 'lr' ? 0.9122 : code === 'dt' ? 0.7964 : 0.8509;
            const baseRecall = code === 'rf' ? 0.8553 : code === 'lightgbm' ? 0.8666 : code === 'lr' ? 0.8116 : code === 'dt' ? 0.7964 : 0.7644;
            const basePrec = code === 'rf' ? 0.8764 : code === 'lightgbm' ? 0.8762 : code === 'lr' ? 0.8372 : code === 'dt' ? 0.8197 : 0.7931;
            const baseF1 = code === 'rf' ? 0.8755 : code === 'lightgbm' ? 0.8751 : code === 'lr' ? 0.8352 : code === 'dt' ? 0.8171 : 0.7922;
            const baseKappa = code === 'rf' ? 0.7220 : code === 'lightgbm' ? 0.7219 : code === 'lr' ? 0.6324 : code === 'dt' ? 0.5948 : 0.5364;
            const baseMcc = code === 'rf' ? 0.7240 : code === 'lightgbm' ? 0.7236 : code === 'lr' ? 0.6356 : code === 'dt' ? 0.5974 : 0.5387;
            const tt = code === 'rf' ? 1.98 : code === 'lightgbm' ? 0.59 : code === 'lr' ? 0.10 : code === 'dt' ? 0.14 : 0.08;

            return {
              modelCode: code,
              modelName: model,
              Accuracy: baseAcc,
              AUC: baseAuc,
              Recall: baseRecall,
              'Prec.': basePrec,
              F1: baseF1,
              Kappa: baseKappa,
              MCC: baseMcc,
              'TT (Sec)': tt
            };
          } else {
            // Regression: R2, MAE, MSE, RMSE, MAPE, RMSLE, TT (Sec)
            const r2 = code === 'rf' ? 0.8542 : code === 'lightgbm' ? 0.8490 : code === 'lr' ? 0.7812 : code === 'dt' ? 0.7204 : 0.6954;
            const mae = code === 'rf' ? 12.54 : code === 'lightgbm' ? 13.12 : code === 'lr' ? 16.45 : code === 'dt' ? 20.12 : 22.54;
            const mse = code === 'rf' ? 234.12 : code === 'lightgbm' ? 242.08 : code === 'lr' ? 310.54 : code === 'dt' ? 412.35 : 465.12;
            const rmse = code === 'rf' ? 15.30 : code === 'lightgbm' ? 15.56 : code === 'lr' ? 17.62 : code === 'dt' ? 20.31 : 21.56;
            const mape = code === 'rf' ? 0.0842 : code === 'lightgbm' ? 0.0890 : code === 'lr' ? 0.1142 : code === 'dt' ? 0.1420 : 0.1584;
            const rmsle = code === 'rf' ? 0.1124 : code === 'lightgbm' ? 0.1165 : code === 'lr' ? 0.1453 : code === 'dt' ? 0.1812 : 0.1984;
            const tt = code === 'rf' ? 2.12 : code === 'lightgbm' ? 0.64 : code === 'lr' ? 0.08 : code === 'dt' ? 0.11 : 0.06;

            return {
              modelCode: code,
              modelName: model,
              R2: r2,
              MAE: mae,
              MSE: mse,
              RMSE: rmse,
              MAPE: mape,
              RMSLE: rmsle,
              'TT (Sec)': tt
            };
          }
        });

        // Sort results based on mlSortMetric
        const sortedResults = [...results].sort((a, b) => {
          const metric = mlSortMetric;
          const isAscendingMetric = ['MAE', 'MSE', 'RMSE', 'MAPE', 'RMSLE'].includes(metric);
          
          const valA = a[metric] || 0;
          const valB = b[metric] || 0;
          
          if (isAscendingMetric) {
            return valA - valB;
          } else {
            return valB - valA;
          }
        });

        setMlTrainResults(sortedResults);
        setMlIsTraining(false);
        setMlToastShow(true);

        // Keep local trainedModel state updated to link prediction
        setTrainedModel({
          intercept: 10.03,
          coefficients: mlInputCols.map(() => 0.5),
          r2: sortedResults[0]?.[isClassification ? 'Accuracy' : 'R2'] || 0.85,
          mse: sortedResults[0]?.['MSE'] || 15.0,
          features: [...mlInputCols],
          target: mlOutputCol
        });

        setTimeout(() => {
          setMlToastShow(false);
        }, 4000);
      }, 1500);
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', position: 'relative', backgroundColor: '#f8f9fa' }}>
        {/* Floating Green Completion Toast */}
        {mlToastShow && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: '#d1e7dd',
            color: '#0f5132',
            border: '1px solid #badbcc',
            padding: '12px 20px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '250px',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            animation: 'fadeIn 0.3s'
          }}>
            <span style={{ fontSize: '1rem' }}>✓</span>
            <div style={{ flex: 1 }}>ML 모델 학습이 완료되었습니다.</div>
            <button
              onClick={() => setMlToastShow(false)}
              style={{ background: 'none', border: 'none', color: '#0f5132', cursor: 'pointer', opacity: 0.8, fontSize: '1rem', padding: 0 }}
            >
              &times;
            </button>
          </div>
        )}

        {/* 1열: 학습 설정 (Left ML Settings) */}
        <div style={{ width: '520px', borderRight: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'white', flexShrink: 0, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>학습 설정</h3>

          {/* 1. Data Selection Stack (Horizontal grid) */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>작업 데이터 선택</label>
              <select
                className="form-control"
                style={{ fontSize: '0.75rem', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', backgroundColor: 'white' }}
                value={activeFilename}
                onChange={(e) => setActiveFilename(e.target.value)}
              >
                {Object.keys(uploadedFiles).map(fn => (
                  <option key={fn} value={fn}>{fn}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>데이터 유형 선택</label>
              <select
                style={{ fontSize: '0.75rem', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', backgroundColor: 'white' }}
                value={mlDataType}
                onChange={(e) => setMlDataType(e.target.value)}
              >
                <option value="Numeric">Numeric</option>
                <option value="Categorical">Categorical</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>모델 유형</label>
              <select
                style={{ fontSize: '0.75rem', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', backgroundColor: 'white' }}
                value={mlModelType}
                onChange={(e) => {
                  setMlModelType(e.target.value);
                  setMlSelectedModels([]);
                }}
              >
                <option value="Classification">Classification</option>
                <option value="Regression">Regression</option>
              </select>
            </div>
          </div>

          {/* Main workspace layout: Divided into 2 sub-columns */}
          <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '480px' }}>
            
            {/* Left Sub-Column: Column Management Workspace (Output, Input, Exclude Stacked Vertically) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
              {/* Output 컬럼 */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>Output 컬럼</span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>최대 1</span>
                </div>
                <div style={{
                  height: '46px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '6px',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}>
                  {mlOutputCol ? (
                    <div
                      onClick={() => setMlSelectedColInOutput(mlSelectedColInOutput === mlOutputCol ? '' : mlOutputCol)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '3px',
                        border: mlSelectedColInOutput === mlOutputCol ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                        backgroundColor: mlSelectedColInOutput === mlOutputCol ? '#eff6ff' : 'white',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mlOutputCol}</span>
                      <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '2px', backgroundColor: '#dcfce7', color: '#16a34a' }}>
                        {fileData.types?.[mlOutputCol] || 'int64'}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#cbd5e1', textAlign: 'center' }}>데이터가 없습니다</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>총 {mlOutputCol ? 1 : 0}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={handleRemoveFromOutput}
                      disabled={!mlOutputCol}
                      style={{
                        width: '28px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: mlOutputCol ? '#0f59f4' : '#cbd5e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        cursor: mlOutputCol ? 'pointer' : 'not-allowed'
                      }}
                      title="Output 컬럼에서 제거"
                    >
                      ↓
                    </button>
                    <button
                      onClick={handleMoveToOutput}
                      disabled={!mlSelectedColInInput}
                      style={{
                        width: '28px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: mlSelectedColInInput ? '#0f59f4' : '#cbd5e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        cursor: mlSelectedColInInput ? 'pointer' : 'not-allowed'
                      }}
                      title="Input 컬럼에서 Output으로 설정"
                    >
                      ↑
                    </button>
                  </div>
                </div>
              </div>

              {/* Input 컬럼 */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '180px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>Input 컬럼</span>
                </div>
                <div style={{
                  flex: 1,
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '6px',
                  overflowY: 'auto',
                  backgroundColor: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {mlInputCols.length === 0 ? (
                    <span style={{ fontSize: '0.7rem', color: '#cbd5e1', textAlign: 'center', margin: 'auto' }}>데이터가 없습니다</span>
                  ) : (
                    mlInputCols.map(col => {
                      const isSelected = col === mlSelectedColInInput;
                      const type = fileData.types?.[col] || 'object';

                      let badgeBg = '#f1f5f9';
                      let badgeColor = '#475569';
                      if (type === 'object') {
                        badgeBg = '#e0f2fe';
                        badgeColor = '#0284c7';
                      } else if (type === 'int64') {
                        badgeBg = '#dcfce7';
                        badgeColor = '#16a34a';
                      } else if (type === 'float64') {
                        badgeBg = '#fef3c7';
                        badgeColor = '#d97706';
                      }

                      return (
                        <div
                          key={col}
                          onClick={() => setMlSelectedColInInput(isSelected ? '' : col)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '4px 6px',
                            borderRadius: '3px',
                            border: isSelected ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                            backgroundColor: isSelected ? '#eff6ff' : 'white',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{col}</span>
                          <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: '2px', backgroundColor: badgeBg, color: badgeColor }}>{type}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>총 {mlInputCols.length}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={handleRemoveFromExclude}
                      disabled={!mlSelectedColInExclude}
                      style={{
                        width: '28px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: mlSelectedColInExclude ? '#0f59f4' : '#cbd5e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        cursor: mlSelectedColInExclude ? 'pointer' : 'not-allowed'
                      }}
                      title="제외 컬럼에서 복원"
                    >
                      ↑
                    </button>
                    <button
                      onClick={handleMoveToExclude}
                      disabled={!mlSelectedColInInput}
                      style={{
                        width: '28px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: mlSelectedColInInput ? '#0f59f4' : '#cbd5e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        cursor: mlSelectedColInInput ? 'pointer' : 'not-allowed'
                      }}
                      title="제외 컬럼으로 설정"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>

              {/* 제외 컬럼 */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>제외 컬럼</span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>최대 1</span>
                </div>
                <div style={{
                  height: '46px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '6px',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}>
                  {mlExcludeCols.length > 0 ? (
                    mlExcludeCols.map(col => (
                      <div
                        key={col}
                        onClick={() => setMlSelectedColInExclude(mlSelectedColInExclude === col ? '' : col)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '3px',
                          border: mlSelectedColInExclude === col ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                          backgroundColor: mlSelectedColInExclude === col ? '#eff6ff' : 'white',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '2px', backgroundColor: '#fef3c7', color: '#d97706' }}>
                          {fileData.types?.[col] || 'float64'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#cbd5e1', textAlign: 'center' }}>데이터가 없습니다</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>총 {mlExcludeCols.length}</span>
                </div>
              </div>
            </div>

            {/* Right Sub-Column: Preprocessing parameters, Model Selection & Triggers */}
            <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
              
              {/* 이상치 제외 여부 (Classification일 때만) */}
              {isClassification && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>
                    이상치 제외 여부 <span style={{ color: '#94a3b8', cursor: 'help' }} title="이상치 기준을 설정하여 분석에서 탈락시킵니다.">?</span>
                  </span>
                  <select
                    style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '130px', backgroundColor: 'white' }}
                    value={mlOutlierHandling}
                    onChange={(e) => setMlOutlierHandling(e.target.value)}
                  >
                    <option value="포함">포함</option>
                    <option value="미포함">미포함</option>
                  </select>
                </div>
              )}

              {/* 학습 데이터 비율 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>학습 데이터 비율</span>
                  <input
                    type="text"
                    readOnly
                    value={mlTrainRatio}
                    style={{
                      width: '45px',
                      height: '20px',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="10"
                    max="95"
                    style={{ flex: 1 }}
                    value={mlTrainRatio * 100}
                    onChange={(e) => setMlTrainRatio(Number(e.target.value) / 100)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', marginTop: '1px' }}>
                  <span>10%</span>
                  <span>95%</span>
                </div>
              </div>

              {/* 교차 검증 유형 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>교차 검증 유형</span>
                <select
                  style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '130px', backgroundColor: 'white' }}
                  value={mlCvType}
                  onChange={(e) => setMlCvType(e.target.value)}
                >
                  {isClassification ? (
                    <>
                      <option value="stratifiedkfold">stratifiedkfold</option>
                      <option value="kfold">kfold</option>
                    </>
                  ) : (
                    <option value="kfold">kfold</option>
                  )}
                </select>
              </div>

              {/* 교차 검증 fold 수 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>교차 검증 fold 수</span>
                  <input
                    type="text"
                    readOnly
                    value={mlCvFolds}
                    style={{
                      width: '45px',
                      height: '20px',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    style={{ flex: 1 }}
                    value={mlCvFolds}
                    onChange={(e) => setMlCvFolds(Number(e.target.value))}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', marginTop: '1px' }}>
                  <span>2</span>
                  <span>10</span>
                </div>
              </div>

              {/* 타겟 데이터 불균형 처리 (Classification일 때만) */}
              {isClassification && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>타겟 데이터 불균형 처리</span>
                  <select
                    style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '130px', backgroundColor: 'white' }}
                    value={mlImbalanceHandling}
                    onChange={(e) => setMlImbalanceHandling(e.target.value)}
                  >
                    <option value="없음">없음</option>
                    <option value="oversampling">oversampling</option>
                    <option value="undersampling">undersampling</option>
                  </select>
                </div>
              )}

              {/* ML 모델 선택 */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>ML 모델 선택</span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>총 {mlSelectedModels.length}  최대 5</span>
                </div>
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflowY: 'auto', maxHeight: '110px', display: 'flex', flexDirection: 'column' }}>
                  {modelsList.map(model => {
                    const isSelected = mlSelectedModels.includes(model);
                    return (
                      <div
                        key={model}
                        onClick={() => handleModelToggle(model)}
                        style={{
                          padding: '5px 8px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : 'white',
                          color: isSelected ? '#0f59f4' : '#334155',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          transition: 'all 0.15s'
                        }}
                      >
                        {model}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 모델 Parameter 설정 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1e293b' }}>모델 Parameter 설정</div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#475569' }}>sort</span>
                  <select
                    style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '130px', backgroundColor: 'white' }}
                    value={mlSortMetric}
                    onChange={(e) => setMlSortMetric(e.target.value)}
                  >
                    {sortMetrics.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#475569' }}>cross_validation</span>
                  <select
                    style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '130px', backgroundColor: 'white' }}
                    value={mlCvEnabled}
                    onChange={(e) => setMlCvEnabled(e.target.value)}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
              </div>

              {/* 학습 시작 */}
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={handleMLTrainRun}
                disabled={mlIsTraining || !mlOutputCol || mlSelectedModels.length === 0}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 0',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginTop: 'auto',
                  backgroundColor: (!mlOutputCol || mlSelectedModels.length === 0) ? '#cbd5e1' : '#0f59f4',
                  cursor: (!mlOutputCol || mlSelectedModels.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                {mlIsTraining ? '머신러닝 학습 중...' : '학습 시작'}
              </button>
            </div>
          </div>
        </div>

        {/* 2열: 학습 결과 (Right results pane) */}
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, overflowY: 'auto' }}>
          
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', backgroundColor: 'white', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '350px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>머신러닝 학습 결과</h3>
              
              {/* Display Result Action buttons if training complete */}
              {mlTrainResults && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => alert('시뮬레이터 평가에서는 머신러닝 ROC 곡선 차트 데모를 준비 중입니다.')}
                    style={{ backgroundColor: '#0f59f4', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    차트 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => alert('학습 완료 모델이 로컬 시뮬레이터 레지스트리에 저장되었습니다.')}
                    style={{ backgroundColor: '#0f59f4', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    모델 저장
                  </button>
                </div>
              )}
            </div>

            {mlIsTraining ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '12px' }}>
                <span style={{ fontSize: '1.5rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                <span style={{ fontSize: '0.8rem' }}>모델 학습 연산 수행 중...</span>
              </div>
            ) : !mlTrainResults ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                학습 시작 버튼을 클릭하여 머신러닝 학습을 시작하세요
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569' }}>Index</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569' }}>Model</th>
                        {isClassification ? (
                          <>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>Accuracy</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>AUC</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>Recall</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>Prec.</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>F1</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>Kappa</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>MCC</th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>R2</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>MAE</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>MSE</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>RMSE</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>MAPE</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>RMSLE</th>
                          </>
                        )}
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#475569' }}>TT (Sec)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mlTrainResults.map((row, idx) => {
                        const isSortedByThis = mlSortMetric;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1', backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                            <td style={{ padding: '8px 12px', color: '#475569' }}>{row.modelCode}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1e293b' }}>{row.modelName}</td>
                            {isClassification ? (
                              <>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'Accuracy' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'Accuracy' ? 'bold' : 'normal' }}>{row.Accuracy.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'AUC' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'AUC' ? 'bold' : 'normal' }}>{row.AUC.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'Recall' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'Recall' ? 'bold' : 'normal' }}>{row.Recall.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'Prec.' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'Prec.' ? 'bold' : 'normal' }}>{row['Prec.'].toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'F1' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'F1' ? 'bold' : 'normal' }}>{row.F1.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'Kappa' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'Kappa' ? 'bold' : 'normal' }}>{row.Kappa.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'MCC' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'MCC' ? 'bold' : 'normal' }}>{row.MCC.toFixed(4)}</td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'R2' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'R2' ? 'bold' : 'normal' }}>{row.R2.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'MAE' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'MAE' ? 'bold' : 'normal' }}>{row.MAE.toFixed(2)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'MSE' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'MSE' ? 'bold' : 'normal' }}>{row.MSE.toFixed(2)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'RMSE' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'RMSE' ? 'bold' : 'normal' }}>{row.RMSE.toFixed(2)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'MAPE' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'MAPE' ? 'bold' : 'normal' }}>{row.MAPE.toFixed(4)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: isSortedByThis === 'RMSLE' ? '#0f59f4' : '#475569', fontWeight: isSortedByThis === 'RMSLE' ? 'bold' : 'normal' }}>{row.RMSLE.toFixed(4)}</td>
                              </>
                            )}
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>{row['TT (Sec)'].toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAiduModelUseTab = () => {
    if (!trainedModel) {
      return (
        <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', gap: '0.5rem' }}>
          <Cpu size={36} />
          <p style={{ fontSize: '0.85rem' }}>먼저 [AI 모델 학습] 탭에서 회귀 모델 학습을 완료해 주세요.</p>
        </div>
      );
    }

    const handlePredict = () => {
      // Calculate prediction: intercept + sum(val * coeff)
      let sum = trainedModel.intercept;
      for (let i = 0; i < trainedModel.features.length; i++) {
        const feature = trainedModel.features[i];
        const val = Number(predictInputs[feature] || 0);
        sum += val * trainedModel.coefficients[i];
      }
      setPredictionResult(Number(sum.toFixed(4)));
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="aidu-section-title">피처 입력값 설정</div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            학습된 수치형 변수들의 값을 입력해 모델 예측값을 생성합니다.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
            {trainedModel.features.map(f => (
              <div key={f} className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.2rem', display: 'block' }}>{f}</label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: '30px' }}
                  placeholder="값 입력..."
                  value={predictInputs[f] || ''}
                  onChange={(e) => {
                    setPredictInputs({
                      ...predictInputs,
                      [f]: e.target.value
                    });
                  }}
                />
              </div>
            ))}
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full" 
            style={{ fontSize: '0.85rem', marginTop: '1rem' }} 
            onClick={handlePredict}
          >
            예측값 생성
          </button>
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card">
            <div className="aidu-card-header">모델 종속 예측 결과</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 'bold' }}>종속 변수 (Target)</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{trainedModel.target}</span>
              </div>

              {predictionResult !== null ? (
                <div style={{ backgroundColor: 'var(--primary-light)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--primary)', textAlign: 'center', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>예측 연산 결과값</span>
                  <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary)' }}>{predictionResult.toLocaleString()}</span>
                </div>
              ) : (
                <div style={{ padding: '1.5rem', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                  좌측에서 각 독립 변수의 피처 입력값을 기입한 뒤 [예측값 생성]을 클릭해 주세요.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduSettingsTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <div className="aidu-card">
          <div className="aidu-card-header">시뮬레이션 환경 설정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>데이터 캐시 초기화</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>수행 중에 로컬에 저장된 모든 데이터와 변수들을 삭제합니다.</div>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                onClick={() => {
                  setUploadedFiles({});
                  setActiveFilename('');
                  setSelectedColumns([]);
                  setAnalysisResults(null);
                  setAiduTab('import');
                  alert('데이터 캐시가 완전히 비워졌습니다.');
                }}
              >
                초기화
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>시뮬레이터 빌드 버젼</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AIDU Web Platform Simulator v1.2 (Standard)</div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--success)' }}>STABLE</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduContainer = () => {
    return (
      <div className="aidu-container">
        {/* Topbar */}
        <div className="aidu-topbar">
          <div className="aidu-topbar-left">
            <span className="aidu-logo">AIDU</span>
            <button type="button" className="aidu-topbar-btn" onClick={() => {
              if (activeFilename && uploadedFiles[activeFilename]) {
                const file = uploadedFiles[activeFilename];
                setSelectedColumns([...file.headers]);
                const N = file.rows.length;
                const initialEnd = Math.max(1, Math.floor(N * 0.3));
                setDataRangeStart(0);
                setDataRangeEnd(initialEnd);
                setVizRenderState(null);
                setHueColumn('');
                setActiveChart('none');
                setBoxplotY('');
                setBoxplotX('');
                setDistributionX('');
                setAnalysisResults(null);
              }
            }}>
              새로고침
            </button>
            <button type="button" className="aidu-topbar-btn" onClick={() => {
              setUploadedFiles({});
              setActiveFilename('');
              setSelectedColumns([]);
              setAnalysisResults(null);
              setAiduTab('import');
              setDataRangeStart(0);
              setDataRangeEnd(0);
              setVizRenderState(null);
              setHueColumn('');
              setActiveChart('none');
              setBoxplotY('');
              setBoxplotX('');
              setDistributionX('');
            }}>
              데이터 초기화
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="aidu-workspace-info">
              {activeFilename ? `현재 작업데이터: ${activeFilename}` : '현재 작업공간: New_Workspace_AICE_Basic'}
            </span>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="aidu-workspace-body">
          {/* Sidebar */}
          <div className="aidu-sidebar">
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'home' ? 'active' : ''}`}
              onClick={() => setAiduTab('home')}
            >
              <Home size={16} /> 홈
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'import' ? 'active' : ''}`}
              onClick={() => setAiduTab('import')}
            >
              <UploadCloud size={16} /> 데이터 가져오기
            </button>
            
            {/* 데이터 분석 accordion menu */}
            <button 
              type="button"
              className={`aidu-menu-item ${['describe', 'sample', 'visualize', 'unsupervised'].includes(aiduTab) ? 'active' : ''}`}
              onClick={() => setDataAnalysisExpanded(!dataAnalysisExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <BarChart2 size={16} /> 데이터 분석
              </span>
              <span style={{ fontSize: '0.65rem' }}>
                {dataAnalysisExpanded ? '▲' : '▼'}
              </span>
            </button>
            
            {dataAnalysisExpanded && (
              <div className="aidu-menu-submenu">
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'describe' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('describe');
                  }}
                >
                  기초정보분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'visualize' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('visualize');
                  }}
                >
                  시각화분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'unsupervised' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('unsupervised');
                  }}
                >
                  비지도학습분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'sample' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('sample');
                  }}
                >
                  데이터샘플보기
                </button>
              </div>
            )}

            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'preprocess' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('preprocess');
              }}
            >
              <Database size={16} /> 데이터 가공
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'model_train' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('model_train');
              }}
            >
              <Brain size={16} /> AI 모델 학습
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'model_use' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('model_use');
              }}
            >
              <Cpu size={16} /> AI 모델 활용
            </button>

            {/* Settings at the bottom */}
            <div style={{ marginTop: 'auto' }}>
              <button 
                type="button"
                className={`aidu-menu-item ${aiduTab === 'settings' ? 'active' : ''}`}
                onClick={() => setAiduTab('settings')}
              >
                <Settings size={16} /> 설정
              </button>
            </div>
          </div>

          {/* Main Content Pane */}
          <div className="aidu-main-content">
            {isCsvLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-light, #8a99ad)' }}>
                <div className="loading-spinner" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary, #3b82f6)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ fontWeight: 'bold' }}>구글 드라이브/스프레드시트에서 실습용 데이터셋을 로드하는 중입니다...</p>
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            ) : csvLoadError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>⚠️</div>
                <h3 style={{ color: 'var(--danger, #dc2626)', fontWeight: 'bold' }}>데이터셋 로드 실패</h3>
                <p style={{ maxWidth: '600px', fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-main, #e2e8f0)', whiteSpace: 'pre-line' }}>
                  {csvLoadError}
                </p>
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--card-bg, #111827)', borderRadius: '6px', border: '1px solid var(--border-color, #374151)', maxWidth: '600px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-light, #9ca3af)' }}>
                  <b style={{ color: '#fff' }}>💡 문제 해결 가이드:</b>
                  <ol style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', listStyleType: 'decimal' }}>
                    <li>구글 스프레드시트의 <b>[파일] &gt; [공유] &gt; [웹에 게시]</b>를 실행했는지 확인합니다.</li>
                    <li>게시 설정에서 형식이 <b>'쉼표로 구분된 값(.csv)'</b>인지 확인합니다. (그냥 드라이브 주소 공유 링크 대신, 웹에 게시된 링크 주소를 복사해 입력해야 합니다.)</li>
                    <li>구글 드라이브 일반 파일인 경우, 공유 권한이 <b>'링크가 있는 모든 사용자(뷰어)'</b>로 설정되어 있는지 확인합니다.</li>
                  </ol>
                </div>
              </div>
            ) : (
              <>
                {aiduTab === 'home' && renderAiduHomeTab()}
                {aiduTab === 'import' && renderAiduImportTab()}
                {aiduTab === 'describe' && renderAiduDescribeTab()}
                {aiduTab === 'visualize' && renderAiduVisualizeTab()}
                {aiduTab === 'unsupervised' && renderAiduUnsupervisedTab()}
                {aiduTab === 'sample' && renderAiduSampleTab()}
                {aiduTab === 'preprocess' && renderAiduPreprocessTab()}
                {aiduTab === 'model_train' && renderAiduModelTrainTab()}
                {aiduTab === 'model_use' && renderAiduModelUseTab()}
                {aiduTab === 'settings' && renderAiduSettingsTab()}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Header Info */}
      <header>
        <div className="header-container">
          <div className="header-left">
            <div className="logo-icon">A</div>
            <div className="logo-text">
              <h1>{attempt.Exam?.name || 'AICE Basic 모의고사'}</h1>
              <span>수험자: {user.displayName}</span>
            </div>
          </div>
          <div className="header-right">
            <div className="progress-header">
              <span className="progress-text">답안 작성 진행률 ({answeredCount}/{questions.length})</span>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleAutoFillCorrectAnswers} 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', marginRight: '0.5rem', backgroundColor: 'var(--success)', border: 'none', color: '#fff' }}
            >
              정답 자동 입력 (테스트)
            </button>
            <button type="button" className="btn btn-secondary" onClick={onLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main 
        className="main-layout" 
        style={hasAiduData ? {
          display: 'grid',
          gridTemplateColumns: rightPanelCollapsed ? '1fr 12px' : '1fr 12px 450px',
          maxWidth: '100%',
          margin: '0 auto',
          padding: '0 12px',
          height: 'calc(100vh - 76px)',
          gap: '0'
        } : {}}
      >
        {hasAiduData ? (
          // ==========================================
          // DUAL-PANE SPLIT LAYOUT (AIDU + Quiz)
          // ==========================================
          <>
            {/* Left Pane: AIDU Platform */}
            <section style={{ overflow: 'hidden', height: '100%' }}>
              {renderAiduContainer()}
            </section>

            {/* Vertical Collapse handle bar */}
            <div 
              onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
              style={{
                width: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-main)',
                borderLeft: '1px solid var(--border-color)',
                borderRight: '1px solid var(--border-color)',
                transition: 'background-color 0.2s',
                zIndex: 100,
                userSelect: 'none'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-card-hover)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--bg-main)'}
              className="vertical-collapse-handle"
            >
              <div style={{
                fontSize: '0.55rem',
                fontWeight: 'bold',
                color: 'var(--text-muted)',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}>
                {rightPanelCollapsed ? '◀ 문제 보기' : '문제 접기 ▶'}
              </div>
            </div>

            {/* Right Pane: Quiz Card & Grid */}
            {!rightPanelCollapsed && (
              <section className="quiz-panel-right" style={{ overflowY: 'auto', height: '100%', paddingLeft: '12px' }}>
              {/* Timer Bar */}
              {(attempt.Exam?.timeMode === 'total' || attempt.Exam?.timeMode === 'per-question') && (
                <div className="timer-container" style={{ marginBottom: 0 }}>
                  <div className="timer-icon">
                    <Clock size={18} color={timerInfo.isWarning ? 'var(--danger)' : 'var(--text-muted)'} />
                  </div>
                  <div className="timer-bar-bg">
                    <div 
                      className={`timer-bar-fill ${timerInfo.isWarning ? 'warning' : ''}`}
                      style={{ width: `${timerInfo.percent}%` }}
                    ></div>
                  </div>
                  <span className="timer-countdown" style={{ color: timerInfo.isWarning ? 'var(--danger)' : 'inherit' }}>
                    {timerInfo.time}
                  </span>
                </div>
              )}

              {activeQuestion && (
                <div className="card" style={{ marginBottom: 0 }}>
                  {activeLocked && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(9, 13, 22, 0.4)',
                      backdropFilter: 'blur(2px)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      color: 'white',
                      borderRadius: 'var(--radius-md)'
                    }}>
                      <AlertCircle size={48} color="var(--danger)" />
                      <h3 style={{ marginTop: '1rem', fontSize: '1.25rem' }}>제한시간 종료로 인해 본 문항은 잠겼습니다.</h3>
                    </div>
                  )}

                  {/* Context Box */}
                  {activeQuestion.reference && renderContext(activeQuestion.reference)}

                  {/* Question Title */}
                  <div className="question-title-container">
                    <div className="question-number">Q{activeQuestion.questionNumber}</div>
                    <div className="question-text" style={{ fontSize: '1.1rem' }}>{activeQuestion.questionText}</div>
                  </div>

                  {/* Option List or Text input */}
                  {activeQuestion.type === 'multiple-choice' ? (
                    <div className="options-list">
                      {activeQuestion.options.map((option, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`option-item ${answers[activeQuestion.id] === idx.toString() ? 'selected' : ''}`}
                          onClick={() => handleAnswerChange(activeQuestion.id, idx.toString())}
                          disabled={activeLocked}
                          style={{ padding: '0.9rem 1.25rem', fontSize: '0.9rem' }}
                        >
                          <div className="option-radio"></div>
                          <span>{option}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="short-answer-container">
                      <input
                        type="text"
                        className="text-input"
                        placeholder={activeQuestion.placeholder || '답안을 입력하세요...'}
                        value={answers[activeQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(activeQuestion.id, e.target.value)}
                        disabled={activeLocked}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Prev/Next Buttons */}
              <div className="nav-buttons" style={{ marginTop: 0 }}>
                <button 
                  className="btn btn-secondary"
                  onClick={goToPrevQuestion}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft size={16} /> 이전
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={goToNextQuestion}
                  disabled={currentIdx === questions.length - 1}
                >
                  다음 <ChevronRight size={16} />
                </button>
              </div>

              {/* Navigation Grid (Inside Sidebar) */}
              <div className="sidebar-card" style={{ padding: '1.25rem', marginBottom: 0 }}>
                <div className="sidebar-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  <span>문항 네비게이션</span>
                  <span className="sidebar-stats">완료 {answeredCount}/{questions.length}</span>
                </div>

                <div className="question-grid" style={{ marginBottom: '1rem', gap: '0.5rem' }}>
                  {questions.map((q, idx) => {
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== '';
                    const isActive = idx === currentIdx;
                    const isLocked = timeLeftMap[q.id] === 0;

                    return (
                      <button
                        key={q.id}
                        className={`grid-item 
                          ${isActive ? 'active' : ''} 
                          ${isAnswered ? 'answered' : ''} 
                          ${isLocked ? 'no-answer' : ''}
                        `}
                        onClick={() => setCurrentIdx(idx)}
                        style={{ height: '35px', width: '35px' }}
                      >
                        {q.questionNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="submit-box" style={{ paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <button 
                    className="btn btn-success btn-full"
                    onClick={handleSubmitClick}
                  >
                    <Send size={16} /> 시험 제출하기
                  </button>
                </div>
              </div>
            </section>
            )}
          </>
        ) : (
          // ==========================================
          // STANDARD SINGLE LAYOUT (Non-Data Analysis)
          // ==========================================
          <>
            {/* Left Side Quiz Screen */}
            <section className="quiz-section">
              {/* Timer Bar */}
              {(attempt.Exam?.timeMode === 'total' || attempt.Exam?.timeMode === 'per-question') && (
                <div className="timer-container">
                  <div className="timer-icon">
                    <Clock size={18} color={timerInfo.isWarning ? 'var(--danger)' : 'var(--text-muted)'} />
                  </div>
                  <div className="timer-bar-bg">
                    <div 
                      className={`timer-bar-fill ${timerInfo.isWarning ? 'warning' : ''}`}
                      style={{ width: `${timerInfo.percent}%` }}
                    ></div>
                  </div>
                  <span className="timer-countdown" style={{ color: timerInfo.isWarning ? 'var(--danger)' : 'inherit' }}>
                    {timerInfo.time}
                  </span>
                </div>
              )}

              {activeQuestion && (
                <div className="card">
                  {activeLocked && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(9, 13, 22, 0.4)',
                      backdropFilter: 'blur(2px)',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      color: 'white',
                      borderRadius: 'var(--radius-md)'
                    }}>
                      <AlertCircle size={48} color="var(--danger)" />
                      <h3 style={{ marginTop: '1rem', fontSize: '1.25rem' }}>제한시간 종료로 인해 본 문항은 잠겼습니다.</h3>
                      <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>다음 문항을 진행해 주세요.</p>
                    </div>
                  )}

                  {/* Context Box */}
                  {activeQuestion.reference && renderContext(activeQuestion.reference)}

                  {/* Question Title */}
                  <div className="question-title-container">
                    <div className="question-number">Q{activeQuestion.questionNumber}</div>
                    <div className="question-text">{activeQuestion.questionText}</div>
                  </div>

                  {/* Option List or Text input */}
                  {activeQuestion.type === 'multiple-choice' ? (
                    <div className="options-list">
                      {activeQuestion.options.map((option, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`option-item ${answers[activeQuestion.id] === idx.toString() ? 'selected' : ''}`}
                          onClick={() => handleAnswerChange(activeQuestion.id, idx.toString())}
                          disabled={activeLocked}
                        >
                          <div className="option-radio"></div>
                          <span>{option}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="short-answer-container">
                      <input
                        type="text"
                        className="text-input"
                        placeholder={activeQuestion.placeholder || '답안을 입력하세요...'}
                        value={answers[activeQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(activeQuestion.id, e.target.value)}
                        disabled={activeLocked}
                      />
                      <span className="field-desc" style={{ marginTop: '0.5rem', display: 'block' }}>
                        입력 후 빈 공간을 누르면 실시간 동기화가 진행됩니다. (대소문자, 띄어쓰기 가리지 않고 정답 판정 지원)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Prev/Next Buttons */}
              <div className="nav-buttons">
                <button 
                  className="btn btn-secondary"
                  onClick={goToPrevQuestion}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft size={16} /> 이전 문항
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={goToNextQuestion}
                  disabled={currentIdx === questions.length - 1}
                >
                  다음 문항 <ChevronRight size={16} />
                </button>
              </div>
            </section>

            {/* Right Side Sidebar Grid */}
            <section className="sidebar">
              <div className="sidebar-card">
                <div className="sidebar-title">
                  <span>문항 네비게이션</span>
                  <span className="sidebar-stats">완료 {answeredCount}/{questions.length}</span>
                </div>

                <div className="question-grid">
                  {questions.map((q, idx) => {
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== '';
                    const isActive = idx === currentIdx;
                    const isLocked = timeLeftMap[q.id] === 0;

                    return (
                      <button
                        key={q.id}
                        className={`grid-item 
                          ${isActive ? 'active' : ''} 
                          ${isAnswered ? 'answered' : ''} 
                          ${isLocked ? 'no-answer' : ''}
                        `}
                        onClick={() => setCurrentIdx(idx)}
                        title={`문항 ${q.questionNumber}`}
                      >
                        {q.questionNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="submit-box">
                  <button 
                    className="btn btn-success btn-full"
                    onClick={handleSubmitClick}
                  >
                    <Send size={16} /> 시험 제출하기
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', textAlign: 'center' }}>
                🔄 {syncStatus}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <div className="modal-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
              <HelpCircle size={32} />
            </div>
            <h3 className="modal-title">시험 답안 제출</h3>
            <p className="modal-desc">
              정말로 시험 답안을 제출하시겠습니까?<br />
              제출 이후에는 답안을 수정하거나 다시 응시할 수 없습니다.<br /><br />
              • 총 문항: {questions.length}개<br />
              • 작성 완료: {answeredCount}개<br />
              • 미작성 문항: {questions.length - answeredCount}개
            </p>
            <div className="modal-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
              >
                돌아가기
              </button>
              <button 
                className="btn btn-primary"
                onClick={submitExamFinal}
              >
                제출 완료
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <div className="footer-container">
          <p>© 2026 AICE Basic 모의고사. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
