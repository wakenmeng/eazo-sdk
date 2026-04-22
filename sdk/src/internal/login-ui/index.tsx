"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

import { auth, _cancelPendingLogin } from "../capabilities/auth";
import { setLoginUI, store, type InternalEazoState } from "../store";
import {
  ArrowLeftIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  MailIcon,
  pickProviderIcon,
} from "./icons";
import { ensureStylesInjected } from "./styles";

function useLoginUI() {
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().loginUI,
    () => store.getSnapshot().loginUI,
  );
}

export function LoginUI(): React.ReactElement | null {
  const ui = useLoginUI();

  React.useEffect(() => {
    ensureStylesInjected();
  }, []);

  React.useEffect(() => {
    if (!ui.open) return;
    auth.fetchSocialConnections().then(
      (all) => {
        setLoginUI({
          providers: all.filter((c) => c.tagsStatus),
          providersLoading: false,
        });
      },
      () => setLoginUI({ providersLoading: false }),
    );
    setLoginUI({ providersLoading: true });
  }, [ui.open]);

  if (typeof document === "undefined") return null;

  const onOpenChange = (next: boolean): void => {
    if (!next) _cancelPendingLogin("user closed login UI");
  };

  return (
    <Dialog.Root open={ui.open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="eazo-overlay" />
        <Dialog.Content className="eazo-content" aria-describedby={undefined}>
          <Dialog.Close className="eazo-close" aria-label="Close">
            <CloseIcon size={16} />
          </Dialog.Close>

          <div className="eazo-header">
            <Dialog.Title className="eazo-title">Welcome</Dialog.Title>
            <Dialog.Description className="eazo-subtitle">Sign in to continue</Dialog.Description>
          </div>

          <div className="eazo-body">
            {ui.step === "providers" ? <ProvidersStep /> : <EmailStep />}
            {ui.error ? <div className="eazo-error">{ui.error}</div> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProvidersStep(): React.ReactElement {
  const ui = useLoginUI();
  const submitting = ui.submitting;

  const handleSocial = async (identifier: string): Promise<void> => {
    setLoginUI({ submitting: true, error: null });
    try {
      await auth.loginWithSocial(identifier);
      setLoginUI({ open: false, submitting: false, error: null });
    } catch (err) {
      setLoginUI({
        submitting: false,
        error: err instanceof Error ? err.message : "Social login failed",
      });
    }
  };

  return (
    <>
      {ui.providersLoading ? (
        <div className="eazo-spinner-row">
          <div className="eazo-spinner" />
        </div>
      ) : (
        ui.providers.map((conn) => (
          <button
            key={conn.identifier}
            className="eazo-provider-btn"
            onClick={() => handleSocial(conn.identifier)}
            disabled={submitting}
          >
            <span className="eazo-provider-icon">{pickProviderIcon(conn.provider)}</span>
            <span>Continue with {conn.tooltip?.["en-US"] || conn.name_en || conn.provider}</span>
          </button>
        ))
      )}

      {!ui.providersLoading ? (
        <>
          <div className="eazo-divider">or</div>
          <button
            type="button"
            className="eazo-email-trigger"
            onClick={() => setLoginUI({ step: "email", error: null })}
          >
            <span className="eazo-provider-icon">
              <MailIcon />
            </span>
            <span>Continue with email</span>
          </button>
        </>
      ) : null}
    </>
  );
}

function EmailStep(): React.ReactElement {
  const ui = useLoginUI();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [sendingCode, setSendingCode] = React.useState(false);
  const cooldownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(
    () => () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    },
    [],
  );

  const startCooldown = (): void => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  const sendCode = async (): Promise<void> => {
    if (!email.includes("@")) return;
    setSendingCode(true);
    setLoginUI({ error: null });
    try {
      await auth.sendEmailCode(email);
      setCodeSent(true);
      startCooldown();
    } catch (err) {
      setLoginUI({
        error: err instanceof Error ? err.message : "Failed to send code",
      });
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async (): Promise<void> => {
    setLoginUI({ submitting: true, error: null });
    try {
      if (ui.emailMode === "code") {
        await auth.loginWithEmailCode(email, code);
      } else {
        await auth.loginWithEmailPassword(email, password);
      }
      setLoginUI({ open: false, submitting: false, step: "providers", error: null });
    } catch (err) {
      setLoginUI({
        submitting: false,
        error: err instanceof Error ? err.message : "Login failed",
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className="eazo-back-btn"
        onClick={() => setLoginUI({ step: "providers", error: null })}
      >
        <ArrowLeftIcon size={14} /> Back
      </button>

      <div className="eazo-input-wrapper">
        <span className="eazo-input-icon">
          <MailIcon size={18} />
        </span>
        <input
          type="email"
          className="eazo-input"
          placeholder="Email address"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {ui.emailMode === "code" ? (
        <>
          {codeSent ? (
            <>
              <div className="eazo-input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="eazo-input eazo-input-code"
                  placeholder="Verification code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="eazo-resend-row">
                <span>Code sent to {email}</span>
                <button
                  type="button"
                  className="eazo-resend-btn"
                  onClick={sendCode}
                  disabled={sendingCode || resendCooldown > 0}
                >
                  {sendingCode
                    ? "Sending…"
                    : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend"}
                </button>
              </div>
              <button
                type="button"
                className="eazo-primary-btn"
                onClick={submit}
                disabled={!email || !code || ui.submitting}
              >
                {ui.submitting ? "Signing in…" : "Log in"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="eazo-primary-btn"
              onClick={sendCode}
              disabled={!email.includes("@") || sendingCode}
            >
              {sendingCode ? "Sending…" : "Send code"}
            </button>
          )}
          <div className="eazo-divider">or</div>
          <button
            type="button"
            className="eazo-secondary-btn"
            onClick={() => setLoginUI({ emailMode: "password", error: null })}
          >
            Continue with password
          </button>
        </>
      ) : (
        <>
          <div className="eazo-input-wrapper">
            <span className="eazo-input-icon">
              <KeyIcon size={18} />
            </span>
            <input
              type={showPassword ? "text" : "password"}
              className="eazo-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="eazo-input-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
          <button
            type="button"
            className="eazo-primary-btn"
            onClick={submit}
            disabled={!email || !password || ui.submitting}
          >
            {ui.submitting ? "Signing in…" : "Log in"}
          </button>
          <div className="eazo-divider">or</div>
          <button
            type="button"
            className="eazo-secondary-btn"
            onClick={() => setLoginUI({ emailMode: "code", error: null })}
          >
            Continue with verification code
          </button>
        </>
      )}
    </>
  );
}
