const state = {
  sessionId: null,
  recording: false,
  mediaRecorder: null,
  chunks: [],
  currentScenario: null
};

const elements = {
  productFile: document.getElementById('productFile'),
  loadSample: document.getElementById('loadSample'),
  scenarioType: document.getElementById('scenarioType'),
  startSession: document.getElementById('startSession'),
  endSession: document.getElementById('endSession'),
  micButton: document.getElementById('micButton'),
  micLabel: document.getElementById('micLabel'),
  textInput: document.getElementById('textInput'),
  sendButton: document.getElementById('sendButton'),
  chatWindow: document.getElementById('chatWindow'),
  scenarioDetails: document.getElementById('scenarioDetails'),
  scenarioText: document.getElementById('scenarioText'),
  scenarioGoal: document.getElementById('scenarioGoal'),
  scenarioIdeal: document.getElementById('scenarioIdeal'),
  evaluationCard: document.getElementById('evaluationCard'),
  evaluationPlaceholder: document.getElementById('evaluationPlaceholder'),
  evaluationSummary: document.getElementById('evaluationSummary'),
  evaluationSuggestions: document.getElementById('evaluationSuggestions'),
  finalScore: document.getElementById('finalScore'),
  strengthsRisks: document.getElementById('strengthsRisks'),
  historyList: document.getElementById('historyList'),
  overallScore: document.getElementById('overallScore'),
  recentDelta: document.getElementById('recentDelta')
};

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

function appendMessage(role, content) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = content;
  elements.chatWindow.appendChild(bubble);
  elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

function resetEvaluation() {
  elements.evaluationCard.classList.add('hidden');
  elements.evaluationPlaceholder.classList.remove('hidden');
  elements.finalScore.textContent = '--';
  elements.evaluationSummary.textContent = '';
  elements.evaluationSuggestions.textContent = '';
  elements.strengthsRisks.innerHTML = '';
}

function setSessionControls(active) {
  elements.micButton.disabled = !active;
  elements.sendButton.disabled = !active;
  elements.textInput.disabled = !active;
  elements.endSession.disabled = !active;
}

async function uploadProducts(products) {
  await fetchJSON('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products })
  });
}

async function loadSampleProducts() {
  const sample = await fetchJSON('/sample-products.json');
  await uploadProducts(sample);
  alert(`Loaded ${sample.length} sample products.`);
}

async function startSession() {
  try {
    resetEvaluation();
    elements.chatWindow.innerHTML = '';
    const mode = elements.scenarioType.value;
    const data = await fetchJSON('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, language: 'English' })
    });
    state.sessionId = data.sessionId;
    state.currentScenario = data.scenario;
    elements.scenarioDetails.classList.remove('hidden');
    elements.scenarioText.textContent = data.scenario.scenario_description;
    elements.scenarioGoal.textContent = data.scenario.customer_goal;
    elements.scenarioIdeal.textContent = data.scenario.ideal_resolution;
    setSessionControls(true);
    await refreshHistory();
  } catch (error) {
    alert(error.message);
  }
}

async function sendMessage(text) {
  if (!text || !state.sessionId) {
    return;
  }
  appendMessage('user', text);
  elements.textInput.value = '';
  try {
    const data = await fetchJSON(`/api/sessions/${state.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    appendMessage('assistant', data.reply);
    if (data.audioUrl) {
      const audio = new Audio(data.audioUrl);
      audio.play();
    }
  } catch (error) {
    appendMessage('assistant', `[Error] ${error.message}`);
  }
}

async function handleRecording() {
  if (state.recording) {
    state.mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.chunks = [];
    state.mediaRecorder.ondataavailable = (event) => {
      state.chunks.push(event.data);
    };
    state.mediaRecorder.onstop = async () => {
      const blob = new Blob(state.chunks, { type: 'audio/webm' });
      state.recording = false;
      elements.micLabel.textContent = 'Start recording';
      stream.getTracks().forEach((track) => track.stop());
      const formData = new FormData();
      formData.append('audio', blob, 'speech.webm');
      try {
        const response = await fetch('/api/audio/transcribe', {
          method: 'POST',
          body: formData
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }
        const data = await response.json();
        if (data.text) {
          await sendMessage(data.text);
        }
      } catch (error) {
        appendMessage('assistant', `[Transcription error] ${error.message}`);
      }
    };
    state.mediaRecorder.start();
    state.recording = true;
    elements.micLabel.textContent = 'Stop recording';
  } catch (error) {
    alert('Microphone permission is required to record audio.');
  }
}

async function endSession() {
  if (!state.sessionId) {
    return;
  }
  try {
    const data = await fetchJSON(`/api/sessions/${state.sessionId}/complete`, {
      method: 'POST'
    });
    elements.evaluationCard.classList.remove('hidden');
    elements.evaluationPlaceholder.classList.add('hidden');
    elements.finalScore.textContent = data.finalScore ? data.finalScore.toFixed(1) : '--';
    elements.evaluationSummary.textContent = data.evaluation.summary;
    elements.evaluationSuggestions.textContent = data.evaluation.suggestions;
    elements.strengthsRisks.innerHTML = '';
    if (data.evaluation.strengths) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = `Strength: ${data.evaluation.strengths}`;
      elements.strengthsRisks.appendChild(pill);
    }
    if (data.evaluation.risks) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = `Risk: ${data.evaluation.risks}`;
      elements.strengthsRisks.appendChild(pill);
    }
    state.sessionId = null;
    setSessionControls(false);
    await refreshHistory();
    await refreshMetrics();
  } catch (error) {
    alert(error.message);
  }
}

async function refreshHistory() {
  const data = await fetchJSON('/api/sessions');
  elements.historyList.innerHTML = '';
  data.sessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${session.mode}</strong><br/><span>${session.scenario.slice(0, 80)}...</span>`;
    const score = document.createElement('div');
    score.className = 'score';
    score.textContent = session.score ? session.score.toFixed(1) : '--';
    card.appendChild(info);
    card.appendChild(score);
    elements.historyList.appendChild(card);
  });
}

async function refreshMetrics() {
  const data = await fetchJSON('/api/metrics');
  elements.overallScore.textContent = data.overall ? data.overall.toFixed(1) : '--';
  if (typeof data.recentImprovement === 'number') {
    const prefix = data.recentImprovement >= 0 ? '+' : '';
    elements.recentDelta.textContent = `Recent improvement: ${prefix}${data.recentImprovement.toFixed(1)}`;
  } else {
    elements.recentDelta.textContent = 'Recent improvement: --';
  }
}

elements.productFile.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const products = JSON.parse(text);
    await uploadProducts(products);
    alert(`Uploaded ${products.length} products.`);
  } catch (error) {
    alert('Invalid JSON file.');
  }
});

elements.loadSample.addEventListener('click', loadSampleProducts);

elements.startSession.addEventListener('click', startSession);

elements.sendButton.addEventListener('click', () => sendMessage(elements.textInput.value));

elements.textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    sendMessage(elements.textInput.value);
  }
});

elements.micButton.addEventListener('click', handleRecording);

elements.endSession.addEventListener('click', endSession);

setSessionControls(false);
refreshHistory();
refreshMetrics();
