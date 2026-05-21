import { apiFetch } from "../../../shared/api.js";

const escapeHtml = (text) => {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
};

const PROVIDERS = [
	{
		id: "resend",
		label: "Resend",
		helperText: "Enter your Resend API key (re_xxx).",
		domainField: false,
	},
	{
		id: "sendgrid",
		label: "SendGrid",
		helperText: "Enter your SendGrid API key (SG.xxx).",
		domainField: false,
	},
	{
		id: "mailgun",
		label: "Mailgun",
		helperText: "Enter your Mailgun API key and sending domain.",
		domainField: true,
	},
];

export function renderEmailDeliverySettings(container) {
	const isActiveTab = () => container?.dataset?.settingsTab === "email";

	const settingsState = {
		provider: "resend",
		apiKeyConfigured: false,
		fromEmail: "",
		mailgunDomain: "",
		configLoaded: false,
	};

	let saving = false;
	let sendingTestEmail = false;

	const showFeedback = (message, isError = false) => {
		let feedback = container.querySelector("#settings-feedback");
		if (!feedback) {
			feedback = document.createElement("div");
			feedback.id = "settings-feedback";
			const feedbackContainer = container.querySelector(".space-y-3");
			if (feedbackContainer) feedbackContainer.appendChild(feedback);
			else container.appendChild(feedback);
		}
		feedback.textContent = message;
		feedback.className = isError
			? "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
			: "rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600";
		feedback.classList.remove("hidden");
		setTimeout(() => feedback.classList.add("hidden"), 3000);
	};

	const getApiKeyHint = () => {
		const p = PROVIDERS.find((x) => x.id === settingsState.provider);
		if (settingsState.apiKeyConfigured) {
			return `An API key is configured for ${p?.label || settingsState.provider}. Enter a new key to replace it.`;
		}
		return p?.helperText || "Enter your API key.";
	};

	const render = () => {
		if (!isActiveTab()) return;

		const maskedValue = settingsState.apiKeyConfigured
			? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
			: "";
		const escapedMaskedValue = escapeHtml(maskedValue);
		const apiKeyHint = escapeHtml(getApiKeyHint());
		const escapedFromEmail = escapeHtml(settingsState.fromEmail);
		const escapedDomain = escapeHtml(settingsState.mailgunDomain);
		const currentProvider = PROVIDERS.find(
			(x) => x.id === settingsState.provider,
		);

		const providerOptions = PROVIDERS.map(
			(p) =>
				`<option value="${p.id}"${p.id === settingsState.provider ? " selected" : ""}>${escapeHtml(p.label)}</option>`,
		).join("");

		container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Email Delivery</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />

              <div class="text-base font-medium text-gray-900 py-2">Provider</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">Email Provider</div>
                <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <select id="email-provider-select" class="w-full appearance-none bg-transparent pr-8 text-sm text-gray-900 outline-none">
                    ${providerOptions}
                  </select>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-gray-500"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.942l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clip-rule="evenodd" /></svg>
                </div>
                <div class="text-[10px] text-gray-600 mt-1">The service used to send transactional emails.</div>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">${escapeHtml(currentProvider?.label || "Provider")} Configuration</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">API Key</div>
                <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="email-api-key" type="password" value="${escapedMaskedValue}" placeholder="Enter your API key" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-[10px] text-gray-600 mt-1">${apiKeyHint}</div>
              </div>

              ${
								settingsState.provider === "mailgun"
									? `
              <div class="py-2">
                <div class="text-xs font-medium mb-1">Sending Domain</div>
                <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="mailgun-domain" type="text" value="${escapedDomain}" placeholder="mg.yourdomain.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-[10px] text-gray-600 mt-1">The domain configured in Mailgun for sending.</div>
              </div>
              `
									: ""
							}
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">From Address</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-1">From Email</div>
                <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                  <input id="email-from" type="email" value="${escapedFromEmail}" placeholder="noreply@yourdomain.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                </div>
                <div class="text-[10px] text-gray-600 mt-1">The email address shown as the sender. Must be verified with your provider.</div>
              </div>
            </section>

            <section class="space-y-1">
              <hr class="border-gray-100/30 my-2" />
              <div class="text-base font-medium text-gray-900 py-2">Test</div>

              <div class="py-2">
                <div class="text-xs font-medium mb-2">Send Test Email</div>
                <div class="flex gap-2">
                  <div class="relative flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
                    <input id="test-email" type="email" placeholder="test@example.com" class="w-full bg-transparent outline-none text-sm text-gray-900 placeholder-gray-500" />
                  </div>
                  <button id="send-test-email" class="px-4 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Send Test
                  </button>
                </div>
              </div>
            </section>

            <div id="settings-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

		bindEvents();
	};

	const saveProvider = async (newProvider) => {
		if (saving) return;
		saving = true;
		const prev = settingsState.provider;
		settingsState.provider = newProvider;
		settingsState.apiKeyConfigured = false;
		try {
			const res = await apiFetch("/api/admin/email-config", {
				method: "PUT",
				body: JSON.stringify({ email_provider: newProvider }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.error || err?.message || "Failed to update provider",
				);
			}
			render();
		} catch (err) {
			settingsState.provider = prev;
			render();
			showFeedback(err?.message || "Failed to update provider.", true);
		} finally {
			saving = false;
		}
	};

	const saveApiKey = async (newValue) => {
		if (newValue.includes("\u2022")) {
			showFeedback("Invalid API key format.", true);
			render();
			return;
		}
		if (saving) return;
		saving = true;
		const prevConfigured = settingsState.apiKeyConfigured;
		const input = container.querySelector("#email-api-key");
		try {
			if (input) input.disabled = true;
			const res = await apiFetch("/api/admin/email-config", {
				method: "PUT",
				body: JSON.stringify({ email_api_key: newValue }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.error || err?.message || "Failed to update API key",
				);
			}
			settingsState.apiKeyConfigured = true;
			render();
			showFeedback("API key saved.");
		} catch (err) {
			settingsState.apiKeyConfigured = prevConfigured;
			render();
			showFeedback(err?.message || "Failed to update API key.", true);
		} finally {
			saving = false;
		}
	};

	const saveFromEmail = async (newFromEmail) => {
		if (saving) return;
		saving = true;
		const prev = settingsState.fromEmail;
		settingsState.fromEmail = newFromEmail;
		try {
			const res = await apiFetch("/api/admin/email-config", {
				method: "PUT",
				body: JSON.stringify({ email_from: newFromEmail }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.error || err?.message || "Failed to update from email",
				);
			}
			showFeedback("From email saved.");
		} catch (err) {
			settingsState.fromEmail = prev;
			showFeedback(err?.message || "Failed to update from email.", true);
		} finally {
			saving = false;
		}
	};

	const saveMailgunDomain = async (newDomain) => {
		if (saving) return;
		saving = true;
		const prev = settingsState.mailgunDomain;
		settingsState.mailgunDomain = newDomain;
		try {
			const res = await apiFetch("/api/admin/email-config", {
				method: "PUT",
				body: JSON.stringify({ mailgun_domain: newDomain }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.error || err?.message || "Failed to update Mailgun domain",
				);
			}
			showFeedback("Mailgun domain saved.");
		} catch (err) {
			settingsState.mailgunDomain = prev;
			showFeedback(err?.message || "Failed to update Mailgun domain.", true);
		} finally {
			saving = false;
		}
	};

	const sendTestEmail = async (email) => {
		if (sendingTestEmail) return;
		if (!email || !email.trim()) {
			showFeedback("Please enter a valid email address.", true);
			return;
		}
		sendingTestEmail = true;
		const sendTestBtn = container.querySelector("#send-test-email");
		const testEmailInput = container.querySelector("#test-email");
		try {
			if (sendTestBtn) {
				sendTestBtn.disabled = true;
				sendTestBtn.textContent = "Sending...";
			}
			if (testEmailInput) testEmailInput.disabled = true;
			const res = await apiFetch("/api/admin/email-config/test", {
				method: "POST",
				body: JSON.stringify({ email: email.trim() }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					err?.error || err?.message || "Failed to send test email",
				);
			}
			showFeedback("Test email sent successfully.");
		} catch (err) {
			showFeedback(err?.message || "Failed to send test email.", true);
		} finally {
			sendingTestEmail = false;
			if (sendTestBtn) {
				sendTestBtn.disabled = false;
				sendTestBtn.textContent = "Send Test";
			}
			if (testEmailInput) testEmailInput.disabled = false;
		}
	};

	const bindEvents = () => {
		const providerSelect = container.querySelector("#email-provider-select");
		const apiKeyInput = container.querySelector("#email-api-key");
		const fromEmailInput = container.querySelector("#email-from");
		const mailgunDomainInput = container.querySelector("#mailgun-domain");
		const testEmailInput = container.querySelector("#test-email");
		const sendTestBtn = container.querySelector("#send-test-email");

		providerSelect?.addEventListener("change", (e) => {
			saveProvider(e.target.value);
		});

		apiKeyInput?.addEventListener("focus", (e) => {
			if (e.target.value.includes("\u2022")) e.target.value = "";
		});
		apiKeyInput?.addEventListener("blur", (e) => {
			const val = e.target.value.trim();
			if (val && !val.includes("\u2022")) saveApiKey(val);
		});

		fromEmailInput?.addEventListener("blur", (e) => {
			const val = e.target.value.trim();
			if (val !== settingsState.fromEmail) saveFromEmail(val);
		});

		mailgunDomainInput?.addEventListener("blur", (e) => {
			const val = e.target.value.trim();
			if (val !== settingsState.mailgunDomain) saveMailgunDomain(val);
		});

		sendTestBtn?.addEventListener("click", () => {
			sendTestEmail(testEmailInput?.value || "");
		});
		testEmailInput?.addEventListener("keypress", (e) => {
			if (e.key === "Enter") sendTestEmail(e.target.value || "");
		});
	};

	const loadConfig = async () => {
		if (settingsState.configLoaded) return;
		settingsState.configLoaded = true;
		try {
			const res = await apiFetch("/api/admin/email-config");
			if (res.ok) {
				const payload = await res.json();
				settingsState.provider = payload?.email_provider || "resend";
				settingsState.apiKeyConfigured =
					payload?.email_api_key_configured ||
					payload?.resend_api_key_configured ||
					false;
				settingsState.fromEmail =
					payload?.email_from || payload?.resend_from_email || "";
				settingsState.mailgunDomain = payload?.mailgun_domain || "";
				if (isActiveTab()) render();
			}
		} catch (err) {
			console.warn("Failed to load email config", err);
		}
	};

	render();
	loadConfig();
}
