const state = {
  selectedWorkflowId: null,
  snapshot: { agents: [], packages: [], workflows: [] },
};

const els = {
  form: document.getElementById("run-form"),
  formError: document.getElementById("form-error"),
  runButton: document.getElementById("run-button"),
  agents: document.getElementById("agent-grid"),
  title: document.getElementById("workflow-title"),
  status: document.getElementById("workflow-status"),
  package: document.getElementById("package-state"),
  steps: document.getElementById("step-list"),
  events: document.getElementById("event-list"),
  eventCount: document.getElementById("event-count"),
  recovery: document.getElementById("recovery-panel"),
  retry: document.getElementById("retry-button"),
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

const agentName = (id) => state.snapshot.agents.find((agent) => agent.id === id)?.name || id;

function renderAgents() {
  els.agents.innerHTML = state.snapshot.agents.map((agent, index) => {
    const capability = agent.capabilities[0];
    const active = ["reserved", "executing"].includes(agent.status);
    return `
      <article class="agent-card ${active ? "is-active" : ""}">
        <div class="agent-meta">
          <span class="agent-index">0${index + 1} / ${escapeHtml(agent.agent_type)}</span>
          <span class="agent-status">${escapeHtml(agent.status)}</span>
        </div>
        <h3>${escapeHtml(agent.name)}</h3>
        <p>${escapeHtml(capability?.description || "No capability advertised")}</p>
        <div class="capability">${escapeHtml(capability?.name || "unavailable")} · ${escapeHtml(agent.location)}</div>
      </article>`;
  }).join("");
}

function selectedWorkflow() {
  return state.snapshot.workflows.find((workflow) => workflow.id === state.selectedWorkflowId)
    || state.snapshot.workflows.at(-1);
}

function renderWorkflow() {
  const workflow = selectedWorkflow();
  if (!workflow) return;
  state.selectedWorkflowId = workflow.id;
  const packageState = state.snapshot.packages.find((item) => item.id === workflow.package_id);

  els.title.textContent = `${workflow.order_id} / ${workflow.package_id}`;
  els.status.textContent = workflow.status.replaceAll("_", " ").toUpperCase();
  els.status.className = `status-chip ${workflow.status}`;
  els.runButton.disabled = ["pending", "running"].includes(workflow.status);
  els.runButton.textContent = workflow.status === "running" ? "Workflow in progress…" : "Run another fulfillment";

  if (packageState) {
    els.package.className = "package-state";
    els.package.innerHTML = `
      <div>
        <div class="package-id">${escapeHtml(packageState.id)} · v${packageState.version}</div>
        <div class="package-route">${escapeHtml(packageState.location)} → ${escapeHtml(packageState.destination)}</div>
      </div>
      <div class="custody">
        <span class="custody-label">Current custody</span>
        <span class="custody-value">${escapeHtml(agentName(packageState.custodian_id))}</span>
      </div>`;
  }

  els.steps.innerHTML = workflow.steps.map((step, index) => {
    const confidence = step.evidence.length
      ? Math.round(Math.max(...step.evidence.map((item) => item.confidence)) * 100)
      : null;
    const evidence = confidence !== null
      ? `<div class="evidence-line">${step.evidence.length} evidence · ${confidence}% confidence</div>`
      : "";
    return `
      <li class="step ${escapeHtml(step.status)}">
        <span class="step-marker">${step.status === "completed" ? "✓" : index + 1}</span>
        <div class="step-body">
          <h3>${escapeHtml(step.name)}</h3>
          <p>${escapeHtml(step.description)}</p>
          ${evidence}
        </div>
        <span class="step-state">${escapeHtml(step.status)}${step.attempt ? ` · A${step.attempt}` : ""}</span>
      </li>`;
  }).join("");

  els.recovery.hidden = workflow.status !== "attention_required";
  const events = [...workflow.events].reverse();
  els.eventCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  els.events.innerHTML = events.length ? events.map((event) => `
    <li>
      <span class="event-type">${escapeHtml(event.type)}</span>
      <p>${escapeHtml(event.message)}</p>
      <span class="event-time">${new Date(event.occurred_at).toLocaleTimeString()}</span>
    </li>`).join("") : '<li class="empty-event">Verified events will appear here.</li>';
}

function render() {
  renderAgents();
  renderWorkflow();
}

async function refresh() {
  try {
    state.snapshot = await api("/api/state");
    render();
  } catch (error) {
    els.formError.textContent = `Orchestrator unavailable: ${error.message}`;
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.formError.textContent = "";
  els.runButton.disabled = true;
  try {
    const payload = {
      order_id: document.getElementById("order-id").value,
      package_id: document.getElementById("package-id").value,
      destination: document.getElementById("destination").value,
      trailer_id: "truck-17",
      fail_at: document.getElementById("inject-failure").checked ? "loading" : null,
      auto_start: true,
    };
    const workflow = await api("/api/workflows", { method: "POST", body: JSON.stringify(payload) });
    state.selectedWorkflowId = workflow.id;
    document.getElementById("order-id").value = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById("package-id").value = `PKG-${Math.floor(1000 + Math.random() * 9000)}`;
    await refresh();
    document.getElementById("workflow-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    els.formError.textContent = error.message;
    els.runButton.disabled = false;
  }
});

els.retry.addEventListener("click", async () => {
  if (!state.selectedWorkflowId) return;
  els.retry.disabled = true;
  try {
    await api(`/api/workflows/${state.selectedWorkflowId}/retry`, { method: "POST", body: "{}" });
    await refresh();
  } catch (error) {
    els.formError.textContent = error.message;
  } finally {
    els.retry.disabled = false;
  }
});

refresh();
setInterval(refresh, 550);

