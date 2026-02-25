const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      --opw-primary: #6b8ce6;
      --opw-primary-dark: #526ec7;
      --opw-header-start: #2b4da3;
      --opw-header-end: #f36f21;
      --opw-text: #2f3b52;
      --opw-muted: #8b95a7;
      --opw-border: #d9dee8;
      --opw-bg: #ffffff;
      --opw-danger: #b91c1c;
      display: block;
      max-width: 420px;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      color: var(--opw-text);
    }

    .modal {
      background: var(--opw-bg);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.25);
      border: 1px solid #cfd7e6;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      background: linear-gradient(90deg, var(--opw-header-start), var(--opw-header-end));
      color: #fff;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .icon-wrap {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    .icon-wrap svg {
      width: 14px;
      height: 14px;
    }

    .title {
      margin: 0;
      font-size: 22px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.1px;
    }

    .subtitle {
      margin: 3px 0 0 0;
      font-size: 12px;
      opacity: 0.95;
      font-weight: 500;
    }

    .close-btn {
      border: 0;
      background: transparent;
      color: #fff;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.95;
      padding: 0;
      margin-top: -2px;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .body {
      padding: 14px 12px 10px 12px;
    }

    .field {
      margin-bottom: 10px;
    }

    .label {
      display: block;
      font-size: 14px;
      color: #43506a;
      margin: 0 0 6px 2px;
      font-weight: 600;
    }

    .label .required {
      color: #d22f2f;
    }

    .hint {
      font-size: 12px;
      color: var(--opw-muted);
      font-weight: 500;
      margin-left: 3px;
    }

    .input,
    .textarea,
    .select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cfd6e4;
      border-radius: 7px;
      color: #364258;
      background: #f9fafc;
      font-size: 15px;
      outline: none;
      transition: box-shadow 0.12s ease, border-color 0.12s ease;
    }

    .input,
    .select {
      height: 42px;
      padding: 0 12px;
    }

    .textarea {
      min-height: 104px;
      padding: 11px 12px;
      resize: vertical;
      line-height: 1.45;
    }

    .input::placeholder,
    .textarea::placeholder {
      color: #8f9bb0;
      font-size: 14px;
    }

    .input:focus,
    .textarea:focus,
    .select:focus {
      border-color: var(--opw-primary);
      box-shadow: 0 0 0 3px rgba(107, 140, 230, 0.17);
      background: #fff;
    }

    .file-input {
      display: none;
    }

    .file-drop {
      border: 1px dashed #c7cfdd;
      border-radius: 9px;
      background: #f7f9fc;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }

    .paperclip-wrap {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      background: #e8eefc;
      color: var(--opw-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex: 0 0 auto;
    }

    .file-text {
      min-width: 0;
    }

    .file-title {
      font-size: 14px;
      color: #37445c;
      font-weight: 600;
      line-height: 1.1;
      margin-bottom: 2px;
    }

    .file-subtitle {
      font-size: 12px;
      color: #8d98ad;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .files {
      margin-top: 8px;
      font-size: 12px;
      color: #5f6b82;
      display: grid;
      gap: 4px;
    }

    .status {
      min-height: 18px;
      margin: 4px 2px 8px;
      font-size: 12px;
      color: #5f6b82;
    }

    .status.error {
      color: var(--opw-danger);
    }

    .footer {
      border-top: 1px solid #e3e7ef;
      padding: 10px 12px 12px 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      background: #fbfcff;
    }

    .btn {
      height: 40px;
      border-radius: 7px;
      border: 0;
      font-size: 22px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.02s ease, opacity 0.12s ease, background-color 0.12s ease;
    }

    .btn:active {
      transform: translateY(1px);
    }

    .btn-cancel {
      background: #e8eaf0;
      color: #444f67;
    }

    .btn-submit {
      background: #86a2ec;
      color: #fff;
    }

    .btn-submit:hover {
      background: var(--opw-primary);
    }

    .btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
  </style>
  <section class="modal">
    <header class="header">
      <div class="header-left">
        <span class="icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M21 3L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M21 3L14 21L10 14L3 10L21 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          </svg>
        </span>
        <div>
          <h3 class="title">Geri Bildirim Gönder</h3>
          <p class="subtitle">Talep ve Öneri Bildirimi</p>
        </div>
      </div>
      <button id="closeBtn" class="close-btn" type="button" aria-label="Kapat">&times;</button>
    </header>

    <form id="form">
      <div class="body">
        <div class="field">
          <label class="label" for="subject">Başlık <span class="required">*</span></label>
          <input id="subject" name="subject" class="input" required placeholder="Talep veya öneriniz için başlık giriniz" />
        </div>

        <div class="field">
          <label class="label" for="platform">Platform <span class="required">*</span></label>
          <select id="platform" name="platform" class="select" required></select>
        </div>

        <div class="field">
          <label class="label" for="files">Dosya Ekle <span class="hint">(isteğe bağlı)</span></label>
          <input id="files" class="file-input" type="file" multiple />
          <label class="file-drop" for="files">
            <span class="paperclip-wrap" aria-hidden="true">&#128206;</span>
            <span class="file-text">
              <div class="file-title">Dosya seçmek için tıklayın</div>
              <div class="file-subtitle">Birden fazla dosya seçebilirsiniz (Maks. 25MB)</div>
            </span>
          </label>
          <div id="fileList" class="files"></div>
        </div>

        <div class="field">
          <label class="label" for="description">Detay <span class="required">*</span></label>
          <textarea id="description" name="description" class="textarea" required placeholder="Talep veya önerinizi detaylı bir şekilde açıklayınız"></textarea>
        </div>

        <input id="owner" name="talep_sahibi" type="hidden" />
        <input id="department" name="birim" type="hidden" />

        <div id="status" class="status"></div>
      </div>

      <footer class="footer">
        <button id="cancelBtn" class="btn btn-cancel" type="button">İptal</button>
        <button id="submitBtn" class="btn btn-submit" type="submit">Gönder</button>
      </footer>
    </form>
  </section>
`;

export class OpenProjectFeedbackWidget extends HTMLElement {
  static get observedAttributes() {
    return [
      "submit-url",
      "upload-url",
      "backend-base-url",
      "title",
      "subtitle",
      "default-platform",
      "default-owner",
      "default-birim",
      "platform-options",
      "openproject-url",
      "openproject-api-token",
      "openproject-project-id",
      "openproject-column-query-id",
      "openproject-platform-custom-field-id",
      "openproject-talep-sahibi-custom-field-id",
      "openproject-birim-custom-field-id",
      "openproject-type-id",
      "openproject-verify-ssl"
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.form = this.shadowRoot.getElementById("form");
    this.submitBtn = this.shadowRoot.getElementById("submitBtn");
    this.cancelBtn = this.shadowRoot.getElementById("cancelBtn");
    this.closeBtn = this.shadowRoot.getElementById("closeBtn");
    this.fileInput = this.shadowRoot.getElementById("files");
    this.fileList = this.shadowRoot.getElementById("fileList");
    this.platformSelect = this.shadowRoot.getElementById("platform");
    this.statusEl = this.shadowRoot.getElementById("status");
    this.titleEl = this.shadowRoot.querySelector(".title");
    this.subtitleEl = this.shadowRoot.querySelector(".subtitle");
    this.onSubmit = this.onSubmit.bind(this);
    this.onCancel = this.onCancel.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onFileChange = this.onFileChange.bind(this);
  }

  connectedCallback() {
    this.form.addEventListener("submit", this.onSubmit);
    this.cancelBtn.addEventListener("click", this.onCancel);
    this.closeBtn.addEventListener("click", this.onClose);
    this.fileInput.addEventListener("change", this.onFileChange);
    this.syncFromAttributes();
  }

  disconnectedCallback() {
    this.form.removeEventListener("submit", this.onSubmit);
    this.cancelBtn.removeEventListener("click", this.onCancel);
    this.closeBtn.removeEventListener("click", this.onClose);
    this.fileInput.removeEventListener("change", this.onFileChange);
  }

  attributeChangedCallback() {
    this.syncFromAttributes();
  }

  syncFromAttributes() {
    const title = this.getAttribute("title");
    const subtitle = this.getAttribute("subtitle");
    const defPlatform = this.getAttribute("default-platform");
    const defOwner = this.getAttribute("default-owner");
    const defBirim = this.getAttribute("default-birim");
    const optionsRaw = this.getAttribute("platform-options");

    const defaultOptions = ["DerinİZ", "İVME", "rom-IoT", "a-MOM"];
    const options = optionsRaw
      ? optionsRaw.split(",").map((item) => item.trim()).filter(Boolean)
      : defaultOptions;

    this.platformSelect.innerHTML = "";
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      this.platformSelect.appendChild(option);
    });

    if (title) this.titleEl.textContent = title;
    if (subtitle) this.subtitleEl.textContent = subtitle;
    if (defPlatform) this.platformSelect.value = defPlatform;
    this.shadowRoot.getElementById("owner").value = defOwner || "Widget User";
    this.shadowRoot.getElementById("department").value = defBirim || "Genel";
  }

  onFileChange() {
    const files = Array.from(this.fileInput.files || []);
    this.fileList.innerHTML = files.length
      ? files.map((file) => `<div>- ${file.name}</div>`).join("")
      : "";
  }

  onCancel() {
    this.form.reset();
    this.fileList.innerHTML = "";
    this.syncFromAttributes();
    this.setStatus("");
    this.dispatchEvent(new CustomEvent("opw-cancel"));
  }

  onClose() {
    this.dispatchEvent(new CustomEvent("opw-close"));
    this.style.display = "none";
  }

  async uploadAttachments(uploadUrl) {
    const files = Array.from(this.fileInput.files || []);
    if (!files.length || !uploadUrl) return [];
    const urls = [];

    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(uploadUrl, {
        method: "POST",
        credentials: "include",
        body
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Upload failed (${response.status})`);
      }
      const data = await response.json();
      if (data?.url) urls.push(data.url);
    }
    return urls;
  }

  setStatus(message, isError = false) {
    this.statusEl.textContent = message || "";
    this.statusEl.className = isError ? "status error" : "status";
  }

  getApiBaseUrl() {
    const attrBase = this.getAttribute("backend-base-url");
    if (attrBase) return attrBase.replace(/\/+$/, "");

    const runtimeEnv = globalThis?.__OPENPROJECT_WIDGET_ENV__;
    if (runtimeEnv && typeof runtimeEnv.OPENPROJECT_WIDGET_BACKEND_BASE_URL === "string" && runtimeEnv.OPENPROJECT_WIDGET_BACKEND_BASE_URL.trim()) {
      return runtimeEnv.OPENPROJECT_WIDGET_BACKEND_BASE_URL.trim().replace(/\/+$/, "");
    }

    // Bundler-injected envs (Vite/Next/Webpack style).
    const processEnvBase =
      typeof process !== "undefined" &&
      process.env &&
      (
        process.env.OPENPROJECT_WIDGET_BACKEND_BASE_URL ||
        process.env.NEXT_PUBLIC_OPENPROJECT_WIDGET_BACKEND_BASE_URL ||
        process.env.VITE_OPENPROJECT_WIDGET_BACKEND_BASE_URL
      );
    if (typeof processEnvBase === "string" && processEnvBase.trim()) {
      return processEnvBase.trim().replace(/\/+$/, "");
    }

    if (typeof window !== "undefined") {
      const globalBase = window.OPENPROJECT_WIDGET_API_BASE_URL;
      if (typeof globalBase === "string" && globalBase.trim()) {
        return globalBase.trim().replace(/\/+$/, "");
      }

      const { protocol, hostname, port, origin } = window.location;
      if (port === "8787") return origin.replace(/\/+$/, "");
      return `${protocol}//${hostname}:8787`;
    }

    return "http://localhost:8787";
  }

  async onSubmit(event) {
    event.preventDefault();
    const apiBaseUrl = this.getApiBaseUrl();
    const submitUrl = this.getAttribute("submit-url") || `${apiBaseUrl}/api/v1/feedback`;
    const uploadUrl = this.getAttribute("upload-url") || `${apiBaseUrl}/api/v1/feedback/upload-file`;
    if (!submitUrl) {
      this.setStatus("Missing `submit-url` attribute.", true);
      return;
    }

    const formData = new FormData(this.form);
    const payload = {
      subject: String(formData.get("subject") || "").trim(),
      platform: String(formData.get("platform") || "").trim(),
      talep_sahibi: String(formData.get("talep_sahibi") || "").trim(),
      birim: String(formData.get("birim") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      attachments: []
    };

    const opConfig = {};
    const attrMap = {
      "openproject-url": "openproject_url",
      "openproject-api-token": "openproject_api_token",
      "openproject-project-id": "openproject_project_id",
      "openproject-column-query-id": "openproject_column_query_id",
      "openproject-platform-custom-field-id": "openproject_platform_custom_field_id",
      "openproject-talep-sahibi-custom-field-id": "openproject_talep_sahibi_custom_field_id",
      "openproject-birim-custom-field-id": "openproject_birim_custom_field_id",
      "openproject-type-id": "openproject_type_id",
      "openproject-verify-ssl": "openproject_verify_ssl"
    };

    Object.entries(attrMap).forEach(([attr, key]) => {
      const raw = this.getAttribute(attr);
      if (raw === null || raw === "") return;
      if (key.endsWith("_id")) {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) opConfig[key] = parsed;
        return;
      }
      if (key === "openproject_verify_ssl") {
        opConfig[key] = raw.toLowerCase() === "true";
        return;
      }
      opConfig[key] = raw;
    });

    if (Object.keys(opConfig).length) {
      payload.openproject_config = opConfig;
    }

    this.submitBtn.disabled = true;
    this.setStatus("Gönderiliyor...");

    try {
      payload.attachments = await this.uploadAttachments(uploadUrl);

      const response = await fetch(submitUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const data = await response.json();
      this.setStatus(`Başarıyla oluşturuldu. İş paketi #${data.work_package_id || "-"}`);
      this.onCancel();
      this.dispatchEvent(new CustomEvent("opw-success", { detail: data }));
    } catch (error) {
      this.setStatus(`Gönderim başarısız: ${error.message}`, true);
      this.dispatchEvent(new CustomEvent("opw-error", { detail: { message: error.message } }));
    } finally {
      this.submitBtn.disabled = false;
    }
  }
}


