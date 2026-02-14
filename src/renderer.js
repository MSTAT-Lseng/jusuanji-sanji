'use strict';

const progressEl = document.getElementById('progress');
const questionTypeEl = document.getElementById('question-type');
const questionTitleEl = document.getElementById('question-title');
const optionsPanelEl = document.getElementById('options-panel');
const optionsFormEl = document.getElementById('options-form');
const resultEl = document.getElementById('result');
const analysisEl = document.getElementById('analysis');
const jumpBoxEl = document.getElementById('jump-box');
const jumpInputEl = document.getElementById('jump-input');
const jumpGoBtn = document.getElementById('jump-go-btn');
const jumpCancelBtn = document.getElementById('jump-cancel-btn');
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

function replayAnimation(element, className) {
  if (!element) {
    return;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function animateQuestionContent() {
  replayAnimation(questionTitleEl, 'content-refresh');
  replayAnimation(optionsPanelEl, 'content-refresh');
  replayAnimation(resultEl, 'content-refresh');
  replayAnimation(analysisEl, 'content-refresh');
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
    setResultText('该题为简答题，不进行自动判题。');
    return;
  }

  const isMultipleChoice = answerIds.length > 1;
  const inputType = isMultipleChoice ? 'checkbox' : 'radio';

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

  questionTitleEl.innerHTML = question.title || '(无题目内容)';
  analysisEl.textContent = '';

  renderOptions(question);
  animateQuestionContent();
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

function hideJumpBox() {
  jumpBoxEl.classList.add('hidden');
}

function showJumpBox() {
  if (!state.total) {
    return;
  }

  jumpBoxEl.classList.remove('hidden');
  jumpInputEl.value = String(state.currentIndex + 1);
  jumpInputEl.focus();
  jumpInputEl.select();
}

function jumpToQuestionByInput() {
  const value = jumpInputEl.value.trim();
  if (!/^\d+$/.test(value)) {
    setResultText('请输入有效题号。');
    return;
  }

  const targetIndex = Number.parseInt(value, 10) - 1;
  if (targetIndex < 0 || targetIndex >= state.total) {
    setResultText(`题号超出范围，请输入 1-${state.total}。`);
    return;
  }

  hideJumpBox();
  loadQuestion(targetIndex);
}

async function init() {
  state.total = await window.quizAPI.getQuestionCount();
  if (!state.total) {
    progressEl.textContent = '题库为空';
    if (questionTypeEl) {
      questionTypeEl.textContent = '类型: -';
    }
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
optionsFormEl.addEventListener('change', () => {
  if (!state.currentQuestion || state.currentQuestion.answer === null) {
    return;
  }

  if (getSelectedAnswerIds().length === 0) {
    setResultText('');
    return;
  }

  submitAnswer();
});
showAnalysisBtn.addEventListener('click', showAnalysis);
progressEl.addEventListener('click', showJumpBox);
progressEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    showJumpBox();
  }
});
jumpGoBtn.addEventListener('click', jumpToQuestionByInput);
jumpCancelBtn.addEventListener('click', hideJumpBox);
jumpInputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    jumpToQuestionByInput();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    hideJumpBox();
  }
});

init();
