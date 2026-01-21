### Current Status
*   **Backend**: We verified that `app/api/groups/[id]/members/route.ts` exists and handles adding a user **by email**. It checks if the requester is an admin and if the target email exists in the database.
*   **Frontend**: The "Invite Member" button on the dashboard is currently static and does nothing.

### The Plan: "Add by Email" Modal
Since the backend logic for adding by email is already in place, I plan to implement the UI to utilize it.

1.  **Create `InviteMemberModal` Component**:
    *   **Input**: A text field for the email address.
    *   **Action**: `POST` to `/api/groups/[id]/members` with `{ email: "..." }`.
    *   **Feedback**: Show success message ("User added!") or error ("User not found", "Already a member").
2.  **Integrate into Dashboard**:
    *   Replace the static "Invite Member" button in `app/groups/[id]/page.tsx` with this Client Component.

### Alternative (Invite Link)
The prompt also mentioned *generating an invite code/link*. Since our database schema (from the prompt) does not currently have a field for `inviteCode` on the `Group` model, implementing a shareable link (e.g., `splitbills.app/join/abc-123`) would require:
1.  Modifying `schema.prisma` to add `inviteCode`.
2.  Creating a migration.
3.  Creating a new page/route to handle joining via code.

**Recommendation**: We should proceed with the **Add by Email** modal first as it's cleaner and fits the existing schema.
