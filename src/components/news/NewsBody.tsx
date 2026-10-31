import React from 'react';
import type { NewsItem } from '../../types';

/** The full text of a news item: editor HTML (cleaned by the server when saved) or older plain text. */
export const NewsContent: React.FC<{ content: string; format: NewsItem['contentFormat']; className?: string }> = ({ content, format, className = '' }) =>
  format === 'html' ? (
    <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: content }} />
  ) : (
    <div className={`whitespace-pre-line text-ink ${className}`}>{content}</div>
  );

/** Plain text as editor HTML, so an older item can be edited in the editor. */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** "فروش، انبار · ۳ نفر به‌نام" for the item's audience, or null when it is for everyone. */
export function audienceSummary(
  item: Pick<NewsItem, 'targetDepartments' | 'targetLocations' | 'targetRoles' | 'targetUserCount'>,
  roleName: (id: string) => string,
): string | null {
  const parts = [
    item.targetDepartments.join('، '),
    item.targetLocations.join('، '),
    item.targetRoles.map(roleName).join('، '),
    item.targetUserCount > 0 ? `${item.targetUserCount.toLocaleString('fa-IR')} نفر به‌نام` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Where a circular is against its deadline: 'soon' is the last day. */
export function deadlineState(item: Pick<NewsItem, 'requiresAck' | 'ackDeadline'>, now = Date.now()): 'none' | 'open' | 'soon' | 'overdue' {
  if (!item.requiresAck || !item.ackDeadline) return 'none';
  const left = new Date(item.ackDeadline).getTime() - now;
  if (left <= 0) return 'overdue';
  return left <= 24 * 60 * 60 * 1000 ? 'soon' : 'open';
}
