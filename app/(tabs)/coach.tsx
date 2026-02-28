/**
 * Coach Screen - AI Nutrition Coach
 * ABSTRACTION: Uses api.askCoach() and db.rateLimit.checkCoach(), never calls OpenAI directly
 */

import React, { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { db } from '@/lib/database';
import { getCached, setCached, invalidate, CACHE_KEYS } from '@/lib/enhanced-cache';
import type { ChatMessage, UserSettings } from '@/types';
import { format, subDays } from 'date-fns';
import ReactMarkdown from 'react-markdown';

export default function CoachScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load settings and messages on mount (with enhanced caching)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try to load settings from cache first
        const cachedSettings = getCached<UserSettings>(CACHE_KEYS.settings);

        if (cachedSettings) {
          // Use cached settings immediately
          setSettings(cachedSettings);
        } else {
          // No cache - fetch settings
          const userSettings = await db.settings.get();
          setSettings(userSettings);
          setCached(CACHE_KEYS.settings, userSettings);
        }

        // Load messages from cache
        const savedMessages = getCached<ChatMessage[]>(CACHE_KEYS.chatMessages);
        if (savedMessages && Array.isArray(savedMessages) && savedMessages.length > 0) {
          setMessages(savedMessages);
        }
      } catch (err) {
        console.error('Error loading coach data:', err);
      }
    };

    loadData();
  }, []);

  // Save messages to cache whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      setCached(CACHE_KEYS.chatMessages, messages);
    } else {
      invalidate(CACHE_KEYS.chatMessages);
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 100);
  }, [messages]);

  const handleClear = () => {
    setMessages([]);
    setError('');
    invalidate(CACHE_KEYS.chatMessages);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || loading || !settings) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setError('');

    // Add user message to chat
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Check rate limit BEFORE making API call (using abstraction)
      const canProceed = await db.rateLimit.checkCoach();

      if (!canProceed) {
        const status = await db.rateLimit.getStatus();
        setError(
          `Rate limit reached (${status.coach_calls_used}/${status.coach_calls_limit}). Resets at ${new Date(
            status.resets_at,
          ).toLocaleTimeString()}`,
        );
        setLoading(false);
        return;
      }

      // Get recent logs for context (last 14 days)
      const today = new Date();
      const fourteenDaysAgo = subDays(today, 14);
      const startDate = format(fourteenDaysAgo, 'yyyy-MM-dd');
      const endDate = format(today, 'yyyy-MM-dd');

      const recentLogsArray = await db.food.getRange(startDate, endDate);

      // Group logs by date for API
      const recentLogs: { [date: string]: typeof recentLogsArray } = {};
      for (const entry of recentLogsArray) {
        if (!recentLogs[entry.entry_date]) {
          recentLogs[entry.entry_date] = [];
        }
        recentLogs[entry.entry_date].push(entry);
      }

      // Build context
      const context = {
        recentLogs,
        targetCalories: settings.target_calories,
        targetProtein: settings.target_protein,
        maintenanceCalories: settings.maintenance_calories,
      };

      // Call API using abstraction with conversation history (threading from local memory)
      // This sends the full conversation to maintain context without storing in database
      const response = await api.askCoach(userMessage, context, messages);

      // Add assistant response to chat
      setMessages((prev) => [...prev, { role: 'assistant', content: response.response }]);
    } catch (err) {
      console.error('Coach error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 pb-32" ref={scrollContainerRef}>
        <div className="max-w-4xl mx-auto">
          {/* Header with Clear button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Nutrition Coach</h1>
              <p className="text-xs text-gray-500 mt-1">
                Ask questions about your nutrition and diet
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="px-4 py-2 hover:bg-gray-100 rounded-md transition-all text-xs font-medium text-gray-600"
              >
                Clear Chat
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md px-4 py-2">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Messages */}
          <div className="space-y-4">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center py-16">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl">💬</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Start a conversation</h3>
                <p className="text-xs text-gray-500">
                  Ask about nutrition, meal planning, or your progress
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index}>
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-md px-4 py-3 bg-black">
                      <p className="text-sm text-white">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full bg-white rounded-md p-4 border border-gray-200 shadow-sm">
                    <ReactMarkdown
                      className="prose prose-sm max-w-none text-gray-700"
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1 className="text-xl font-bold text-gray-900 mb-2" {...props} />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2 className="text-lg font-bold text-gray-900 mb-2" {...props} />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 className="text-base font-bold text-gray-900 mb-2" {...props} />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong className="text-gray-900 font-bold" {...props} />
                        ),
                        a: ({ node, ...props }) => (
                          <a className="text-black underline" {...props} />
                        ),
                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({ node, ...props }) => (
                          <ul className="list-disc pl-5 mb-2" {...props} />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol className="list-decimal pl-5 mb-2" {...props} />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-500">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Input Form */}
      <div
        className="fixed left-0 right-0 bg-white border-t border-gray-200 z-50"
        style={{ bottom: '65px' }}
      >
        <div className="max-w-4xl mx-auto px-3 py-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask your nutrition coach..."
              disabled={loading}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-sm text-gray-900 placeholder-gray-500 resize-none transition-all max-h-24"
              rows={2}
            />
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="flex-shrink-0 px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg transition-all disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center min-w-[80px]"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                'Send'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Key Abstractions Used:
 *
 * ✅ api.askCoach() - Calls Next.js API route (OpenAI key is safe!)
 * ✅ db.rateLimit.checkCoach() - Checks rate limit via database abstraction
 * ✅ db.food.getRange() - Gets recent food logs for context
 * ✅ cache.* - Stores messages in MMKV cache
 *
 * NEVER directly calls OpenAI or Supabase!
 */
