/**
 * ChatInput Component - Food Logging Interface
 * ABSTRACTION: Uses api.analyzeFood() and db.rateLimit.checkFood(), never calls OpenAI directly
 */

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { db } from '@/lib/database';
import type { FoodEntry } from '@/types';

interface ChatInputProps {
  onFoodLogged: (entry: Omit<FoodEntry, 'id' | 'entry_date' | 'created_at' | 'user_id'>) => void;
}

// Convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function ChatInput({ onFoodLogged }: ChatInputProps) {
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Image size must be less than 10MB');
        return;
      }

      try {
        const base64 = await fileToBase64(file);
        setImage(base64);
        setImagePreview(URL.createObjectURL(file));
        setError('');
      } catch (err) {
        setError('Error loading image');
        console.error(err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim() && !image) {
      setError('Please provide either a description or an image');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check rate limit BEFORE making API call (using abstraction)
      const canProceed = await db.rateLimit.checkFood();

      if (!canProceed) {
        const status = await db.rateLimit.getStatus();
        setError(`Rate limit reached (${status.calls_used}/${status.calls_limit}). Resets at ${new Date(status.resets_at).toLocaleTimeString()}`);
        setLoading(false);
        return;
      }

      // Call API using abstraction (API key is safe on server!)
      const nutritionData = await api.analyzeFood(description, image || undefined);

      // Success - pass data to parent
      // Note: We don't store image_data anymore (only needed for GPT analysis)
      onFoodLogged({
        name: nutritionData.name,
        calories: nutritionData.calories,
        protein: nutritionData.protein,
        description: description || nutritionData.name,
        // image_data removed - not stored in database (only sent to GPT for analysis)
      });

      // Reset form
      setDescription('');
      setImage(null);
      setImagePreview(null);
      const fileInput = document.getElementById('chat-image-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err) {
      console.error('Food analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze food. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
    const fileInput = document.getElementById('chat-image-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  return (
    // In-flow footer: the parent screen's flex column pins it above the tab
    // bar, so no fixed positioning or tab-bar-height guesses are needed
    <div className="bg-paper-raised/70 backdrop-blur-sm border-t border-line">
      <div className="max-w-7xl mx-auto px-3 py-3">
        {/* Error Message */}
        {error && (
          <div className="mb-2 bg-danger-soft border border-danger/20 text-danger px-2.5 py-1.5 rounded-ctrl text-xs flex items-start gap-1.5">
            <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Image Preview (if any) */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-16 w-16 object-cover rounded-ctrl border border-line"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 p-1 bg-paper-raised text-ink-soft hover:text-danger active:text-danger rounded-full border border-line shadow-card"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Image Upload Button */}
          <label className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center bg-paper-inset hover:bg-paper-deep active:bg-paper-deep text-ink-soft hover:text-ink rounded-ctrl cursor-pointer transition duration-150">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              id="chat-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              disabled={loading}
            />
          </label>

          {/* Text Input */}
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add 1 or multiple items (e.g., 2 rotis, dal, rice)"
            className="flex-1 min-w-0 px-3 py-2.5 border border-line-strong rounded-ctrl focus:outline-none focus:ring-1 focus:ring-ink-muted bg-paper-raised/70 backdrop-blur-sm text-base text-ink placeholder:text-ink-faint transition duration-150"
            disabled={loading}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={loading || (!description.trim() && !image)}
            className="flex-shrink-0 px-4 min-h-[44px] bg-ink hover:bg-ink-soft text-white rounded-ctrl transition duration-150 ease-out active:scale-[0.98] disabled:bg-ink-faint disabled:cursor-not-allowed disabled:active:scale-100 font-medium text-sm flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="hidden sm:inline">Analyzing...</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Send</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Key Abstractions Used:
 *
 * ✅ api.analyzeFood() - Calls Next.js API route (OpenAI key is safe!)
 * ✅ db.rateLimit.checkFood() - Checks rate limit via database abstraction
 * ✅ Native web file input - Cross-browser compatible
 * ✅ Tailwind CSS - Clean, responsive styling
 *
 * NEVER directly calls OpenAI or Supabase!
 */
