import { db } from './index.js';
import { polls, pollOptions, pollVotes } from './schema.js';
import { eq, inArray } from 'drizzle-orm';
import { Poll, PollOption, PollVotePayload, FreeTextResponse } from '../types.js';

export async function getAllPolls() {
  const allPolls = await db.select().from(polls);
  const allOptions = await db.select().from(pollOptions);
  const allVotes = await db.select().from(pollVotes);

  return allPolls.map(p => {
    const options = allOptions.filter(o => o.pollId === p.id);
    const votes = allVotes.filter(v => v.pollId === p.id);

    return {
      ...p,
      options: options.map(o => ({
        id: o.id,
        text: o.text,
        votesCount: o.votesCount || 0
      })),
      freeTextResponses: votes.filter(v => v.freeText).map(v => ({
        id: v.id.toString(),
        anonymousUserHash: `user-${v.userId.substring(0, 5)}`,
        responseText: v.freeText!,
        submittedAt: v.submittedAt?.toISOString() || ''
      })),
      votedUserIds: votes.map(v => v.userId)
    };
  });
}

export async function createPoll(poll: Omit<Poll, 'totalVotes' | 'isActive' | 'votedUserIds' | 'freeTextResponses'>) {
  await db.insert(polls).values({
    id: poll.id,
    title: poll.title,
    description: poll.description,
    department: poll.department,
    createdBy: poll.createdBy,
    expiryDate: poll.expiryDate,
    type: poll.type,
    totalVotes: 0,
    isActive: true
  });

  if (poll.options && poll.options.length > 0) {
    await db.insert(pollOptions).values(poll.options.map(o => ({
      id: o.id,
      pollId: poll.id,
      text: o.text,
      votesCount: 0
    })));
  }
}

export async function voteOnPoll(payload: PollVotePayload) {
  // Check if user already voted
  const existingVote = await db.select().from(pollVotes).where(eq(pollVotes.pollId, payload.pollId));
  if (existingVote.some(v => v.userId === payload.userId)) {
    throw new Error('User has already voted');
  }

  await db.insert(pollVotes).values({
    pollId: payload.pollId,
    userId: payload.userId,
    optionId: payload.optionId,
    freeText: payload.freeText
  });

  if (payload.optionId) {
    const option = await db.select().from(pollOptions).where(eq(pollOptions.id, payload.optionId));
    if (option.length > 0) {
      await db.update(pollOptions)
        .set({ votesCount: (option[0].votesCount || 0) + 1 })
        .where(eq(pollOptions.id, payload.optionId));
    }
  }

  const poll = await db.select().from(polls).where(eq(polls.id, payload.pollId));
  if (poll.length > 0) {
    await db.update(polls)
      .set({ totalVotes: (poll[0].totalVotes || 0) + 1 })
      .where(eq(polls.id, payload.pollId));
  }
}
