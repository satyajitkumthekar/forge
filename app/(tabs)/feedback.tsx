/**
 * Feedback Screen - User Feedback Submission
 * ABSTRACTION: Uses db.feedback API, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/database';

const FEEDBACK_TYPES = [
  { id: 'feature_request', label: 'Feature Request', icon: '✨' },
  { id: 'general_suggestion', label: 'General Suggestion', icon: '💡' },
  { id: 'bug_report', label: 'Bug Report', icon: '🐛' },
  { id: 'positive_feedback', label: 'I just want to say good things', icon: '❤️' },
];

interface Feedback {
  id: string;
  rating: number;
  feedback_type: string;
  message: string;
  created_at: string;
}

export default function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [selectedType, setSelectedType] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<Feedback[]>([]);
  const [feedbackCount, setFeedbackCount] = useState(0);

  // Load feedback history and today's count on mount
  useEffect(() => {
    loadFeedbackData();
  }, []);

  const loadFeedbackData = async () => {
    try {
      const [history, count] = await Promise.all([
        db.feedback.getHistory(),
        db.feedback.getTodayCount(),
      ]);
      setFeedbackHistory(history);
      setFeedbackCount(count);
    } catch (err) {
      console.error('Error loading feedback data:', err);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);

    // Validation
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    if (!selectedType) {
      setError('Please select a feedback type');
      return;
    }

    if (!message.trim()) {
      setError('Please enter your feedback message');
      return;
    }

    setLoading(true);

    try {
      // Use database abstraction
      await db.feedback.submit(rating, selectedType, message);

      // Success! Clear form and reload history
      setSuccess(true);
      setRating(0);
      setSelectedType('');
      setMessage('');
      await loadFeedbackData();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getFeedbackTypeLabel = (type: string) => {
    const feedbackType = FEEDBACK_TYPES.find((t) => t.id === type);
    return feedbackType ? feedbackType.label : type;
  };

  const getFeedbackTypeIcon = (type: string) => {
    const feedbackType = FEEDBACK_TYPES.find((t) => t.id === type);
    return feedbackType ? feedbackType.icon : '📝';
  };

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 p-3">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-gray-900">Send Feedback</h1>
          <p className="text-xs text-gray-600 mt-1">
            Help us improve! Share your thoughts, report bugs, or suggest new features.
          </p>
          <p className="text-xs text-gray-700 mt-2">
            You've submitted <span className="font-semibold">{feedbackCount}</span> of 3 feedbacks
            today
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-sm text-green-800">
              Thank you for your feedback! We appreciate you taking the time to help us improve.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Feedback Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          {/* Star Rating */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Rate your experience</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-all"
                >
                  <svg
                    className="w-8 h-8"
                    fill={star <= rating ? '#FBBF24' : 'none'}
                    stroke={star <= rating ? '#FBBF24' : '#D1D5DB'}
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Type */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              What type of feedback do you have?
            </h3>
            <div className="space-y-3">
              {FEEDBACK_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedType === type.id
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{type.icon}</span>
                    <span className="text-sm font-medium text-gray-900">{type.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Your feedback</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-sm text-gray-900 placeholder-gray-500 resize-none transition-all"
              rows={6}
            />
            <p className="mt-1 text-xs text-gray-600 text-right">{message.length} characters</p>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || feedbackCount >= 3}
            className="w-full py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-all disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
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
                <span>Submitting...</span>
              </div>
            ) : feedbackCount >= 3 ? (
              'Daily Limit Reached'
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>

        {/* Feedback History */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-4">Your Feedback History</h2>

          {feedbackHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">No feedback yet</h3>
              <p className="text-xs text-gray-600">Your submitted feedback will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackHistory.map((feedback) => (
                <div
                  key={feedback.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getFeedbackTypeIcon(feedback.feedback_type)}</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {getFeedbackTypeLabel(feedback.feedback_type)}
                      </span>
                    </div>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className="w-3.5 h-3.5"
                          fill={i < feedback.rating ? '#FBBF24' : 'none'}
                          stroke={i < feedback.rating ? '#FBBF24' : '#D1D5DB'}
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                          />
                        </svg>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-gray-700 mb-3">{feedback.message}</p>

                  {/* Date */}
                  <p className="text-xs text-gray-500">{formatDate(feedback.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
