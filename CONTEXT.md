# zerosum

A shared-expenses tracker for groups of people, built on a double-entry ledger where every transaction's entries sum to zero.

## Language

### People and groups

**Member**:
A person who can take part in shared expenses. A member can belong to many **Groups**.
_Avoid_: User, participant (outside a specific expense)

**Group**:
A set of **Members** who share expenses. Balances only ever exist within one group.

**Membership**:
A **Member**'s permanent place in a **Group**. Once joined, a member never leaves. Joining is not retroactive: a new member takes part only in **Transactions** recorded after they join.

### Ledger

**Account**:
The single ledger account a **Member** has in a **Group**. It is created when they join, and there is exactly one per **Membership**.

**Transaction**:
An atomic ledger event made of two or more **Entries** that sum to zero. Its type is **Expense**, **Settlement** or **Reversal**.

**Amount** (of a **Transaction**):
The headline sum of a **Transaction**: an **Expense**'s total, a **Settlement**'s payment, or for a **Reversal** the amount of the transaction it reverses. It describes the transaction; **Balances** come only from **Entries**.

**Occurred at**:
When a **Transaction** happened in real life, as stated by whoever recorded it. It may be in the past but never in the future, and it defaults to the moment of recording. A **Reversal** always occurs at the moment of voiding.
_Avoid_: Date (ambiguous with the recording time)

**Recorded at**:
When a **Transaction** was written to the ledger. **Membership** rules are checked against this moment, not against **Occurred at**.

**Entry**:
A single signed amount posted to one **Account** within one **Transaction**. Positive is a debit, negative is a credit. A transaction has at most one entry per account, so a member's effect in a transaction is always a single netted amount.

### Transaction types

**Expense**:
A **Transaction** in which one **Member** (the **Payer**) paid an amount that is divided among one or more **Participants** by a **Split**. An expense whose only participant is the payer is meaningless and does not exist.
_Avoid_: Bill, purchase

**Payer**:
The single **Member** who paid for an **Expense**. The Payer does not have to be a **Participant**.

**Participant**:
A **Member** who has a share of an **Expense**. Every participant's share is a positive amount, and no member appears twice.

**Split**:
The rule dividing an **Expense** among its **Participants**: **equal** (the total divided evenly, with leftover cents going one each to participants in member-id order, which is deliberately arbitrary) or **exact** (an explicit positive amount per participant, summing to the total).

**Settlement**:
A **Transaction** recording a payment that already happened, from one **Member** to a different **Member** in the same **Group**. It is a recorded fact, so any positive amount is accepted, even one larger than what was owed.
_Avoid_: Payment, transfer, settle-up (as a noun)

**Reversal**:
A **Transaction** that mirrors exactly one **Expense** or **Settlement**, cancelling its effect. A Reversal can never itself be voided.

**Void**:
The act of creating a **Reversal** for a **Transaction**. A transaction is voided at most once. Mistakes are fixed by voiding and recording a new **Transaction**. Nothing is edited or deleted.
_Avoid_: Delete, cancel, edit, undo

### Balances

**Balance**:
What a **Member** stands to receive in one **Group**. Positive means the member is owed money, negative means they owe. It is the negation of their **Account**'s sum, and the sum of all balances in a group is always zero.
_Avoid_: Net position, net, debt (as a general term)

**Sent** / **Received**:
The **Settlement** amounts a **Member** has sent or received, both positive and net of **Voids**.

**Settlement plan**:
A suggested list of **Settlements** that would bring every **Balance** in a **Group** to zero. It is advice only and records nothing. It uses as few payments as is reasonable but does not guarantee the true minimum.
_Avoid_: Debt simplification (as the name of the output), suggested payments

**Creditor** / **Debtor**:
A **Member** with a positive (creditor) or negative (debtor) **Balance**.

**Statement**:
The chronological list of every **Entry** on a **Member**'s **Account** in one **Group**, with a running **Balance**.
