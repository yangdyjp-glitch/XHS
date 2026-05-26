import { useState } from "react";
import { useAuth } from "../hooks/useAuth.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="w-full max-w-sm px-6">
        <div className="card-surface p-8 lg:p-10">
          <div className="text-center mb-8">
            <p className="eyebrow mb-2">MATRIX COMPASS</p>
            <h1 className="editorial-heading text-3xl">矩阵罗盘</h1>
            <div className="w-12 h-[1.5px] bg-ink mx-auto mt-4" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="eyebrow block mb-1.5">USERNAME</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-paper border border-hairline text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div>
              <label className="eyebrow block mb-1.5">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-paper border border-hairline text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2 rounded-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ink text-card text-sm font-medium tracking-wide rounded-full hover:bg-ink-soft disabled:opacity-50 transition-colors"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </form>

          <p className="mono-data text-muted text-center mt-8">
            账号由管理员创建，如需开通请联系负责人
          </p>
        </div>
      </div>
    </div>
  );
}
