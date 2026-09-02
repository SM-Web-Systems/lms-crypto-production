import { useState, useEffect } from "react";
import { twoFaApi } from "../lib/api";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle, Smartphone, Mail, Key } from "lucide-react";

type Method = "totp" | "email" | "static";

export default function TwoFaSettings() {
  const [status, setStatus] = useState<{ enabled: boolean; method: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<Method>("totp");

  // Setup state
  const [setupData, setSetupData] = useState<any>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [staticCode, setStaticCode] = useState("");
  const [staticConfirm, setStaticConfirm] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Disable state
  const [showDisable, setShowDisable] = useState(false);
  const [disableToken, setDisableToken] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try {
      const res = await twoFaApi.status();
      setStatus(res);
    } catch { /* */ } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    try {
      if (selectedMethod === "static") {
        if (staticCode.length !== 6 || !/^\d{6}$/.test(staticCode)) {
          toast.error("Please enter a 6-digit code");
          setLoading(false);
          return;
        }
        if (staticCode !== staticConfirm) {
          toast.error("Codes don't match");
          setLoading(false);
          return;
        }
      }
      const res = await twoFaApi.setup(selectedMethod, selectedMethod === "static" ? staticCode : undefined);
      setSetupData({ ...res, method: selectedMethod });

      if (selectedMethod === "static") {
        setSetupData({ ...res, method: "static" });
      }
      if (selectedMethod === "email") {
        toast.success("Verification code sent to your email");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to setup 2FA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyToken || verifyToken.length < 6) {
      return toast.error("Enter a valid code");
    }
    setVerifying(true);
    try {
      const res = await twoFaApi.verify(verifyToken);
      setBackupCodes(res.backupCodes);
      toast.success("2FA enabled successfully!");
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyBackupCodes = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedCodes(true);
    toast.success("Copied!");
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleDoneBackupCodes = () => {
    setBackupCodes(null);
    setSetupData(null);
    setVerifyToken("");
    loadStatus();
  };

  const handleDisable = async () => {
    if (!disablePassword) return toast.error("Password is required");
    if (!disableToken) return toast.error("2FA code is required");
    setDisabling(true);
    try {
      await twoFaApi.disable(disableToken, disablePassword);
      toast.success("2FA disabled");
      setShowDisable(false);
      setDisableToken("");
      setDisablePassword("");
      setStatus({ enabled: false, method: "none" });
    } catch (err: any) {
      toast.error(err.message || "Failed to disable 2FA");
    } finally {
      setDisabling(false);
    }
  };


  const handleSendDisableCode = async () => {
    setSendingCode(true);
    try {
      await twoFaApi.sendEmailCode("");
      toast.success("Verification code sent to your email");
    } catch (err: any) {
      toast.error(err.message || "Failed to send code");
    } finally {
      setSendingCode(false);
    }
  };

  const methods: { key: Method; icon: any; label: string; desc: string }[] = [
    { key: "totp", icon: Smartphone, label: "Authenticator App", desc: "Google Authenticator, Authy, etc." },
    { key: "email", icon: Mail, label: "Email Code", desc: "Receive a code via email each login" },
    { key: "static", icon: Key, label: "Fixed Security Code", desc: "Set your own 6-digit code for login verification" },
  ];

  if (loading && !setupData) {
    return (
      <div className="flex items-center gap-2 text-stellar-muted text-sm py-2">
        <Loader2 size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  // ── Backup codes display ──
  if (backupCodes) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            <h3 className="text-sm font-semibold text-yellow-400">Save Your Backup Codes</h3>
          </div>
          <p className="text-xs text-yellow-300/80">
            Save these codes securely. Each can only be used once. You won't see them again.
          </p>
          <div className="grid grid-cols-2 gap-2 p-3 bg-stellar-dark rounded-lg">
            {backupCodes.map((code, i) => (
              <code key={i} className="text-xs text-stellar-text font-mono text-center py-1">{code}</code>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCopyBackupCodes}
              className="flex-1 py-2 rounded-lg border border-yellow-500/30 text-xs text-yellow-300 hover:bg-yellow-500/10 flex items-center justify-center gap-1.5">
              {copiedCodes ? <Check size={12} /> : <Copy size={12} />}
              {copiedCodes ? "Copied" : "Copy All"}
            </button>
            <button onClick={handleDoneBackupCodes}
              className="flex-1 py-2 rounded-lg bg-stellar-blue text-white text-xs font-medium hover:bg-stellar-purple transition-colors">
              I've Saved My Codes
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── TOTP setup (QR code) ──
  if (setupData?.method === "totp") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stellar-text flex items-center gap-2">
          <Smartphone size={16} className="text-stellar-blue" /> Setup Authenticator App
        </h3>
        <div className="flex justify-center p-4 bg-white rounded-xl">
          <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-stellar-muted">Scan with Google Authenticator, Authy, etc. Or enter manually:</p>
          <code className="block px-3 py-2 rounded-lg bg-stellar-dark border border-stellar-border text-xs text-stellar-blue break-all select-all">
            {setupData.secret}
          </code>
        </div>
        <div className="space-y-2">
          <input type="text" inputMode="numeric" maxLength={6} value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ""))} placeholder="000000"
            className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text text-center text-lg tracking-[0.5em] font-mono placeholder:text-stellar-muted/30 focus:outline-none focus:border-stellar-blue" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSetupData(null); setVerifyToken(""); }}
            className="flex-1 py-3 rounded-xl border border-stellar-border text-stellar-muted text-sm hover:text-stellar-text transition-colors">Cancel</button>
          <button onClick={handleVerify} disabled={verifying || verifyToken.length < 6}
            className="flex-1 py-3 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {verifying && <Loader2 size={14} className="animate-spin" />} Verify & Enable
          </button>
        </div>
      </div>
    );
  }

  // ── Email setup (enter code) ──
  if (setupData?.method === "email") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stellar-text flex items-center gap-2">
          <Mail size={16} className="text-stellar-blue" /> Verify Email Code
        </h3>
        <p className="text-xs text-stellar-muted">A 6-digit code was sent to your email. Enter it below to enable email-based 2FA.</p>
        <input type="text" inputMode="numeric" maxLength={6} value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ""))} placeholder="000000"
          className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text text-center text-lg tracking-[0.5em] font-mono placeholder:text-stellar-muted/30 focus:outline-none focus:border-stellar-blue" />
        <div className="flex gap-2">
          <button onClick={() => { setSetupData(null); setVerifyToken(""); }}
            className="flex-1 py-3 rounded-xl border border-stellar-border text-stellar-muted text-sm hover:text-stellar-text transition-colors">Cancel</button>
          <button onClick={handleVerify} disabled={verifying || verifyToken.length < 6}
            className="flex-1 py-3 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {verifying && <Loader2 size={14} className="animate-spin" />} Verify & Enable
          </button>
        </div>
      </div>
    );
  }


  // ── Static code setup (user enters their chosen 6-digit code) ──
  if (setupData?.method === "static") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stellar-text flex items-center gap-2">
          <Key size={16} className="text-stellar-blue" /> Verify Your Security Code
        </h3>
        <p className="text-xs text-stellar-muted">Enter your chosen 6-digit code to confirm and enable 2FA.</p>
        <input type="text" inputMode="numeric" maxLength={6} value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ""))} placeholder="000000"
          className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text text-center text-lg tracking-[0.5em] font-mono placeholder:text-stellar-muted/30 focus:outline-none focus:border-stellar-blue" />
        <div className="flex gap-2">
          <button onClick={() => { setSetupData(null); setVerifyToken(""); setStaticCode(""); setStaticConfirm(""); }}
            className="flex-1 py-3 rounded-xl border border-stellar-border text-stellar-muted text-sm hover:text-stellar-text transition-colors">Cancel</button>
          <button onClick={handleVerify} disabled={verifying || verifyToken.length < 6}
            className="flex-1 py-3 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {verifying && <Loader2 size={14} className="animate-spin" />} Verify & Enable
          </button>
        </div>
      </div>
    );
  }

  // ── Disable flow ──
  if (showDisable) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stellar-danger flex items-center gap-2">
          <ShieldOff size={16} /> Disable Two-Factor Authentication
        </h3>
        <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)}
          placeholder="Current password"
          className="w-full px-3 py-2.5 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text text-sm placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue" />
        <div className="space-y-2">
          <input type="text" inputMode="numeric" maxLength={8} value={disableToken}
            onChange={(e) => setDisableToken(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
            placeholder={status?.method === "email" ? "Email code or backup code" : status?.method === "static" ? "Your 6-digit security code" : "6-digit code or backup code"}
            className="w-full px-3 py-2.5 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text text-sm placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue text-center tracking-widest" />
          {status?.method === "email" && (
            <button onClick={handleSendDisableCode} disabled={sendingCode}
              className="w-full py-2 rounded-lg border border-stellar-blue/30 text-stellar-blue text-xs hover:bg-stellar-blue/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              {sendingCode ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              {sendingCode ? "Sending..." : "Send verification code to email"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowDisable(false); setDisableToken(""); setDisablePassword(""); }}
            className="flex-1 py-3 rounded-xl border border-stellar-border text-stellar-muted text-sm hover:text-stellar-text transition-colors">Cancel</button>
          <button onClick={handleDisable} disabled={disabling}
            className="flex-1 py-3 rounded-xl bg-stellar-danger text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {disabling && <Loader2 size={14} className="animate-spin" />} Disable 2FA
          </button>
        </div>
      </div>
    );
  }

  // ── Default: status + method selector ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className={status?.enabled ? "text-green-400" : "text-stellar-muted"} />
          <span className="text-sm text-stellar-text">Two-Factor Authentication</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          status?.enabled ? "bg-green-500/20 text-green-400" : "bg-stellar-muted/20 text-stellar-muted"
        }`}>
          {status?.enabled
            ? `${status.method === "totp" ? "App" : status.method === "email" ? "Email" : "Static"}`
            : "Disabled"}
        </span>
      </div>

      {status?.enabled ? (
        <>
          <p className="text-xs text-stellar-muted">
            Your account is protected with {status.method === "totp" ? "authenticator app" : status.method === "email" ? "email code" : "static backup codes"} verification.
          </p>
          <button onClick={() => setShowDisable(true)}
            className="w-full py-3 rounded-xl border border-stellar-danger/30 text-stellar-danger text-sm hover:bg-stellar-danger/10 transition-colors">
            Disable 2FA
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-stellar-muted">Choose a verification method:</p>
          <div className="space-y-2">
            {methods.map(({ key, icon: Icon, label, desc }) => (
              <button key={key} onClick={() => setSelectedMethod(key)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                  selectedMethod === key
                    ? "border-stellar-blue bg-stellar-blue/10"
                    : "border-stellar-border hover:bg-white/5"
                }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedMethod === key ? "bg-stellar-blue/20" : "bg-stellar-dark"
                }`}>
                  <Icon size={18} className={selectedMethod === key ? "text-stellar-blue" : "text-stellar-muted"} />
                </div>
                <div>
                  <span className={`text-sm font-medium ${selectedMethod === key ? "text-stellar-text" : "text-stellar-muted"}`}>
                    {label}
                  </span>
                  <p className="text-xs text-stellar-muted/70">{desc}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedMethod === "static" && (
            <div className="space-y-3 p-4 bg-stellar-dark/50 border border-stellar-border rounded-lg">
              <p className="text-xs text-stellar-muted">Choose a 6-digit code you'll remember:</p>
              <input type="password" inputMode="numeric" maxLength={6} value={staticCode}
                onChange={(e) => setStaticCode(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text text-center text-lg tracking-[0.5em] font-mono placeholder:text-stellar-muted/30 focus:outline-none focus:border-stellar-blue" />
              <input type="password" inputMode="numeric" maxLength={6} value={staticConfirm}
                onChange={(e) => setStaticConfirm(e.target.value.replace(/\D/g, ""))}
                placeholder="Confirm 6-digit code"
                className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text text-center text-lg tracking-[0.5em] font-mono placeholder:text-stellar-muted/30 focus:outline-none focus:border-stellar-blue" />
              {staticCode.length === 6 && staticConfirm.length === 6 && staticCode !== staticConfirm && (
                <p className="text-xs text-red-400 text-center">Codes don't match</p>
              )}
            </div>
          )}
          <button onClick={handleSetup}
            className="w-full py-3 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors">
            Enable 2FA
          </button>
        </>
      )}
    </div>
  );
}
