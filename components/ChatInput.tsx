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
    <div
      className="fixed left-0 right-0 bg-white/70 backdrop-blur-sm border-t border-gray-200 z-50"
      style={{
        bottom: 'calc(65px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="max-w-7xl mx-auto px-3 py-3">
        {/* Error Message */}
        {error && (
          <div className="mb-2 bg-red-50 border border-red-200 text-red-800 px-2.5 py-1.5 rounded-lg text-xs flex items-start gap-1.5">
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
              className="h-16 w-16 object-cover rounded-lg border border-gray-200"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 p-1 bg-white text-gray-600 hover:text-red-600 rounded-full border border-gray-200 shadow-sm"
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
          <label className="flex-shrink-0 p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 rounded-lg cursor-pointer transition-all">
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
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white/70 backdrop-blur-sm text-sm text-gray-900 placeholder-gray-500 transition-all"
            disabled={loading}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={loading || (!description.trim() && !image)}
            className="flex-shrink-0 px-4 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg transition-all disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-1.5"
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
