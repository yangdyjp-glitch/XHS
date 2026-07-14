import { useState } from "react";
import { useLocation } from "wouter";
import { TOPIC_PRIORITY, VALID_STATUS_TRANSITIONS, TOPIC_STATUS } from "@shared/enums.js";
import { useAuth } from "../../hooks/useAuth.js";

interface Topic {
  id: number;
  title: string;
  accountName: string | null;
  creatorName: string | null;
  topicType: string;
  keywords: string[] | null;
  status: string;
  priority: string | null;
  plannedPublishDate: string | null;
}

interface Props {
  topic: Topic;
  onStatusChange: (newStatus: string, reason?: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-gray-100 text-gray-600",
  low: "bg-green-100 text-green-700",
};

export default function TopicCard({ topic, onStatusChange }: Props) {
  const [, navigate] = useLocation();
  const { isLeader } = useAuth();
  const [showActions, setShowActions] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const transitions = (VALID_STATUS_TRANSITIONS[topic.status] || []).flatMap((rule) =>
    rule.by === "any" || (rule.by === "leader" && isLeader) || rule.by === "teacher" ? rule.next : [],
  );

  const handleAction = (newStatus: string) => {
    if (newStatus === "rejected") {
      setShowReject(true);
      return;
    }
    onStatusChange(newStatus);
    setShowActions(false);
  };

  const needsLeader = (status: string) =>
    ["approved", "rejected"].includes(status) ||
    (topic.status === "pending_check" && status === "scheduled");

  return (
    <div
      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/topic/${topic.id}`)}
    >
      <div className="flex items-start justify-between gap-1">
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">
          {topic.title}
        </h3>
        {topic.priority && topic.priority !== "normal" && (
          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLORS[topic.priority] || ""}`}>
            {(TOPIC_PRIORITY as Record<string, string>)[topic.priority] || topic.priority}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
          {topic.topicType}
        </span>
        {topic.keywords?.slice(0, 2).map((k) => (
          <span key={k} className="text-xs bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">
            {k}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{topic.accountName}</span>
        <span>{topic.creatorName}</span>
      </div>

      {topic.plannedPublishDate && (
        <div className="mt-1 text-xs text-gray-400">
          计划: {topic.plannedPublishDate}
        </div>
      )}

      {/* Status actions */}
      {transitions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          {!showActions && !showReject && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(true); }}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              操作...
            </button>
          )}
          {showActions && (
            <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              {transitions.map((s) => {
                const disabled = needsLeader(s) && !isLeader;
                return (
                  <button
                    key={s}
                    onClick={() => !disabled && handleAction(s)}
                    disabled={disabled}
                    className={`text-xs px-2 py-1 rounded ${
                      disabled
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    {(TOPIC_STATUS as Record<string, string>)[s] || s}
                  </button>
                );
              })}
              <button
                onClick={() => setShowActions(false)}
                className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600"
              >
                取消
              </button>
            </div>
          )}
          {showReject && (
            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="否决原因..."
                className="w-full text-xs border rounded p-1 resize-none"
                rows={2}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    onStatusChange("rejected", rejectReason);
                    setShowReject(false);
                    setShowActions(false);
                  }}
                  className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100"
                >
                  确认否决
                </button>
                <button
                  onClick={() => { setShowReject(false); setShowActions(false); }}
                  className="text-xs px-2 py-1 text-gray-400"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
