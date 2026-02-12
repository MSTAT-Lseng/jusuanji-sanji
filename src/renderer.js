'use strict';

const progressEl = document.getElementById('progress');
const questionIdEl = document.getElementById('question-id');
const questionTypeEl = document.getElementById('question-type');
const questionTitleEl = document.getElementById('question-title');
const optionsPanelEl = document.getElementById('options-panel');
const optionsFormEl = document.getElementById('options-form');
const resultEl = document.getElementById('result');
const analysisEl = document.getElementById('analysis');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const submitBtn = document.getElementById('submit-btn');
const showAnalysisBtn = document.getElementById('show-analysis-btn');

const state = {
  total: 0,
  currentIndex: 0,
  currentQuestion: null,
  expectedAnswerIds: []
};

function splitAnswerTokens(answer) {
  if (typeof answer !== 'string' || answer.trim() === '') {
    return [];
  }

  return answer
    .split(/[,\s，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function decodeAnswerIds(answer, options) {
  const tokens = splitAnswerTokens(answer);
  if (tokens.length === 0) {
    return [];
  }

  const optionIdSet = new Set(options.map((option) => option.id));
  const allMatchDirectly = tokens.every((token) => optionIdSet.has(token));
  if (allMatchDirectly) {
    return tokens;
  }

  if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
    const mask = Number.parseInt(tokens[0], 10);
    const numericOptions = options
      .map((option) => ({
        text: option.id,
        value: Number.parseInt(option.id, 10)
      }))
      .filter((option) => Number.isInteger(option.value) && option.value > 0);

    if (numericOptions.length === options.length && !optionIdSet.has(tokens[0])) {
      return numericOptions
        .map((option) => option.value)
        .sort((a, b) => a - b)
        .filter((value) => (mask & value) === value)
        .map((value) => String(value));
    }
  }

  return tokens;
}

function parseSourceAttach(sourceAttach) {
  if (typeof sourceAttach !== 'string' || sourceAttach.trim() === '') {
    return [];
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(sourceAttach, 'application/xml');
  const parseError = xmlDoc.querySelector('parsererror');

  if (!parseError) {
    const xmlItems = [...xmlDoc.querySelectorAll('it')];
    if (xmlItems.length > 0) {
      return xmlItems
        .map((item) => ({
          id: (item.getAttribute('Id') || item.getAttribute('id') || '').trim(),
          text: (item.textContent || '').trim()
        }))
        .filter((item) => item.id !== '');
    }
  }

  const regex = /<it\b[^>]*\bId="([^"]+)"[^>]*>([\s\S]*?)<\/it>/gi;
  const results = [];
  let match = regex.exec(sourceAttach);
  while (match) {
    results.push({
      id: match[1].trim(),
      text: match[2].replace(/\r?\n/g, ' ').trim()
    });
    match = regex.exec(sourceAttach);
  }
  return results;
}

function setResultText(text) {
  resultEl.textContent = text || '';
}

function updateButtonState() {
  prevBtn.disabled = state.currentIndex <= 0;
  nextBtn.disabled = state.currentIndex >= state.total - 1;
}

function getSelectedAnswerIds() {
  return [...optionsFormEl.querySelectorAll('input:checked')].map((input) => input.value);
}

function renderOptions(question) {
  const options = parseSourceAttach(question.sourceAttach);
  const answerIds = decodeAnswerIds(question.answer, options);
  const isShortAnswer = question.answer === null;

  state.expectedAnswerIds = answerIds;

  optionsFormEl.innerHTML = '';
  optionsPanelEl.classList.toggle('hidden', isShortAnswer);
  submitBtn.disabled = false;

  if (isShortAnswer) {
    questionTypeEl.textContent = '类型: 简答题';
    setResultText('该题为简答题，不进行自动判题。');
    return;
  }

  const isMultipleChoice = answerIds.length > 1;
  const inputType = isMultipleChoice ? 'checkbox' : 'radio';
  questionTypeEl.textContent = isMultipleChoice ? '类型: 多选题' : '类型: 单选题';

  if (options.length === 0) {
    setResultText('该题未找到可用选项。');
    submitBtn.disabled = true;
    return;
  }

  setResultText('');

  options.forEach((option) => {
    const label = document.createElement('label');
    label.className = 'option-item';

    const input = document.createElement('input');
    input.type = inputType;
    input.name = isMultipleChoice ? `option-${option.id}` : 'option';
    input.value = option.id;

    const text = document.createElement('span');
    text.className = 'option-text';
    text.textContent = `${option.id}. ${option.text}`;

    label.appendChild(input);
    label.appendChild(text);
    optionsFormEl.appendChild(label);
  });
}

async function loadQuestion(index) {
  const question = await window.quizAPI.getQuestionByIndex(index);
  if (!question) {
    return;
  }

  state.currentIndex = index;
  state.currentQuestion = question;

  progressEl.textContent = `第 ${state.currentIndex + 1} 题 / 共 ${state.total} 题`;
  questionIdEl.textContent = `ID: ${question.id}`;

  questionTitleEl.innerHTML = question.title || '(无题目内容)';
  analysisEl.textContent = '';

  renderOptions(question);
  updateButtonState();
}

function showAnalysis() {
  if (!state.currentQuestion) {
    return;
  }
  analysisEl.textContent = state.currentQuestion.analyse || '暂无解析';
}

function submitAnswer() {
  if (!state.currentQuestion) {
    return;
  }

  if (state.currentQuestion.answer === null) {
    setResultText('该题为简答题，不进行自动判题。');
    return;
  }

  const expected = state.expectedAnswerIds;
  const selected = getSelectedAnswerIds();

  if (selected.length === 0) {
    setResultText('请先选择答案。');
    return;
  }

  const expectedSet = new Set(expected);
  const selectedSet = new Set(selected);
  const isCorrect =
    expectedSet.size === selectedSet.size && [...selectedSet].every((id) => expectedSet.has(id));

  const correctAnswerText = expected.join(', ');
  const selectedAnswerText = [...selectedSet].join(', ');

  setResultText(
    `${isCorrect ? '回答正确' : '回答错误'}\n你的答案: ${selectedAnswerText}\n正确答案: ${correctAnswerText}`
  );
}

async function init() {
  state.total = await window.quizAPI.getQuestionCount();
  if (!state.total) {
    progressEl.textContent = '题库为空';
    questionTypeEl.textContent = '类型: -';
    questionTitleEl.textContent = '未读取到任何题目。';
    submitBtn.disabled = true;
    showAnalysisBtn.disabled = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  await loadQuestion(0);
}

prevBtn.addEventListener('click', () => {
  if (state.currentIndex > 0) {
    loadQuestion(state.currentIndex - 1);
  }
});

nextBtn.addEventListener('click', () => {
  if (state.currentIndex < state.total - 1) {
    loadQuestion(state.currentIndex + 1);
  }
});

submitBtn.addEventListener('click', submitAnswer);
showAnalysisBtn.addEventListener('click', showAnalysis);

init();
