import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';

// Tikkie payment requests expire after roughly two weeks; the countdown starts when the link is saved in admin.
export const TIKKIE_VALID_DAYS = 14;
const DAY_MS = 86400000;

export const DEFAULT_GOALS = [
  { amount: 100, label: 'Free fruit daily' },
  { amount: 150, label: 'Paint and Sip — the wine is free' },
  { amount: 300, label: 'Free beer for events in the room' },
  { amount: 500, label: 'Extra crazy End Party' },
  { amount: 650, label: "Emma's bak after the Sunday half marathon gets upped to half a litre" },
  { amount: 750, label: 'Rent a karaoke bar for a bit during the pub crawl' },
  { amount: 840, label: 'Camiel does a litre at the End Party' },
  { amount: 950, label: 'Personal survive-Buixieval recovery goodie bag' },
  { amount: 1041, label: "Emma's bak after the Sunday half marathon gets upped to a litre" },
];

export const DEFAULT_TEAM_GOAL = {
  amount: 750,
  label: 'First team to reach it is crowned the winner + End Party in their theme',
};

// every: repeats for each multiple of amount; limit: only the first N donors to reach it.
export const DEFAULT_REWARDS = [
  { amount: 1, label: 'Groupchat' },
  { amount: 5, label: 'Stickers' },
  { amount: 10, label: 'Personal goodie' },
  { amount: 15, every: true, label: 'Your name in the lottery for a tray of bozu' },
  { amount: 35, every: true, label: 'Buixieval timer on the Buixieval board — Emma and Camiel' },
  { amount: 50, limit: 3, label: 'Gift for the first 3 donators to reach €50' },
  { amount: 75, label: 'Any shoey — Emma takes off the shoes she is wearing and does a shoey (Mon–Fri only)' },
  { amount: 75, label: 'Any Assen on Camiel (you pay for transport, Mon–Sat only)' },
  { amount: 100, label: 'Buixieval god — Emma and Camiel are your beerfeut for the week' },
];

// The two teams are fixed; their ids must match validTeam() in firestore.rules.
export const TEAMS = [
  { id: 'blue', name: 'Blue', emoji: '💙', order: 1 },
  { id: 'pink', name: 'Pink', emoji: '💗', order: 2 },
];

const donationTime =(d) => d.confirmedAt?.seconds ?? d.createdAt?.seconds ?? Infinity;


// Live view of everything the public pages need. Calls back once all three sources have loaded.
export function watchPublic(onData, onError) {
  const state = { members: null, donations: null, config: undefined };
  const emit = () => {
    if (state.members && state.donations && state.config !== undefined) {
      onData(computeStats(state));
    }
  };
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const unsubs = [
    onSnapshot(collection(db, 'members'), (s) => { state.members = list(s); emit(); }, onError),
    onSnapshot(collection(db, 'donations'), (s) => { state.donations = list(s); emit(); }, onError),
    onSnapshot(doc(db, 'config', 'public'), (s) => { state.config = s.exists() ? s.data() : null; emit(); }, onError),
  ];
  return () => unsubs.forEach((u) => u());
}

export function computeStats({ members, donations, config }) {
  const sum = (list) => list.reduce((acc, d) => acc + d.amount, 0);
  const confirmed = donations.filter((d) => d.status === 'confirmed');
  const pending = donations.filter((d) => d.status === 'pending');

  const raisedBy = {};
  const pendingBy = {};
  for (const d of confirmed) raisedBy[d.uid] = (raisedBy[d.uid] || 0) + d.amount;
  for (const d of pending) pendingBy[d.uid] = (pendingBy[d.uid] || 0) + d.amount;

  const memberStats = members.map((m) => ({ ...m, raised: raisedBy[m.id] || 0, pending: pendingBy[m.id] || 0 }));
  const membersById = Object.fromEntries(memberStats.map((m) => [m.id, m]));

  const teamStats = TEAMS.map((t) => ({
    ...t,
    name: config?.teamNames?.[t.id]?.trim() || t.name,
    slug: t.id,
    members: memberStats.filter((m) => m.teamId === t.id).length,
    raised: sum(confirmed.filter((d) => d.teamId === t.id)),
    pending: sum(pending.filter((d) => d.teamId === t.id)),
  }));

  const leaderboard = memberStats
    .filter((m) => m.raised > 0)
    .sort((a, b) => b.raised - a.raised)
    .slice(0, 10)
    .map((m) => ({ name: m.name, amount: m.raised, teamId: m.teamId }));

  const going = {};
  for (const m of members) for (const day of m.days || []) going[day] = (going[day] || 0) + 1;

  const goals = [...(config?.goals?.length ? config.goals : DEFAULT_GOALS)].sort((a, b) => a.amount - b.amount);
  const teamGoal = config?.teamGoal?.amount ? config.teamGoal : DEFAULT_TEAM_GOAL;
  const rewards = config?.rewards?.length ? config.rewards : DEFAULT_REWARDS;

  // First team whose running confirmed total crosses the team goal wins.
  let winnerId = null;
  const running = {};
  for (const d of [...confirmed].sort((a, b) => donationTime(a) - donationTime(b))) {
    if (!d.teamId) continue;
    running[d.teamId] = (running[d.teamId] || 0) + d.amount;
    if (running[d.teamId] >= teamGoal.amount) { winnerId = d.teamId; break; }
  }
  for (const t of teamStats) t.winner = t.id === winnerId;

  const tikkieAddedAtMs = config?.tikkieAddedAt?.toMillis?.() || 0;
  const tikkieExpired = Boolean(config?.tikkieLink)
    && (!tikkieAddedAtMs || Date.now() - tikkieAddedAtMs >= TIKKIE_VALID_DAYS * DAY_MS);

  return {
    teams: teamStats,
    teamsById: Object.fromEntries(teamStats.map((t) => [t.id, t])),
    members: memberStats,
    membersById,
    donations,
    totalRaised: sum(confirmed),
    totalPending: sum(pending),
    memberCount: members.length,
    leaderboard,
    going,
    goals,
    teamGoal,
    rewards,
    winnerId,
    payment: {
      revolutUsername: config?.revolutUsername || '',
      iban: config?.iban || '',
      accountName: config?.accountName || '',
      // An expired (or untimed) Tikkie link is never handed out; donors see a note instead.
      tikkieLink: tikkieExpired ? '' : (config?.tikkieLink || ''),
      tikkieExpired,
    },
  };
}

// Per-member totals and earned rewards, from confirmed donations.
export function computeDonorRewards(donations, membersById, rewards) {
  const confirmed = donations.filter((d) => d.status === 'confirmed').sort((a, b) => donationTime(a) - donationTime(b));
  const donors = new Map();
  const reachedOrder = rewards.map(() => []);

  for (const d of confirmed) {
    const donor = donors.get(d.uid) || { uid: d.uid, name: membersById[d.uid]?.name || 'Unknown', total: 0, count: 0 };
    const before = donor.total;
    donor.total += d.amount;
    donor.count += 1;
    donors.set(d.uid, donor);
    rewards.forEach((r, i) => {
      if (r.limit && before < r.amount && donor.total >= r.amount) reachedOrder[i].push(d.uid);
    });
  }

  return [...donors.values()].map((donor) => {
    const earned = [];
    rewards.forEach((r, i) => {
      if (r.every) {
        const times = Math.floor(donor.total / r.amount);
        if (times) earned.push(`${times}× ${r.label}`);
      } else if (r.limit) {
        const place = reachedOrder[i].indexOf(donor.uid);
        if (place !== -1 && place < r.limit) earned.push(`${r.label} (#${place + 1})`);
      } else if (donor.total >= r.amount) {
        earned.push(r.label);
      }
    });
    return { ...donor, earned };
  }).sort((a, b) => b.total - a.total);
}

export async function joinAsMember(user, { name, teamId, days }) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'members', user.uid), { name, teamId, days, createdAt: serverTimestamp() });
  batch.set(doc(db, 'memberContacts', user.uid), { email: user.email });
  await batch.commit();
}

export function updateMember(uid, changes) {
  return updateDoc(doc(db, 'members', uid), changes);
}

// Member pictures live in their own collection so the main member list stays small.
export function watchPhotos(onData) {
  return onSnapshot(collection(db, 'memberPhotos'), (snap) => {
    onData(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().image])));
  }, () => onData({}));
}

export const setMemberPhoto = (uid, image) => setDoc(doc(db, 'memberPhotos', uid), { image, updatedAt: serverTimestamp() });
export const removeMemberPhoto = (uid) => deleteDoc(doc(db, 'memberPhotos', uid));

function makeReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return 'BX-' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Members can cancel their own pending pledge; the rules refuse anything else.
export function cancelPledge(id) {
  return updateDoc(doc(db, 'donations', id), { status: 'cancelled' });
}

export async function createDonation({ uid, teamId, amount }) {
  const ref = doc(collection(db, 'donations'));
  const reference = makeReference();
  await setDoc(ref, {
    uid,
    teamId: teamId || null,
    amount,
    status: 'pending',
    reference,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, reference };
}
