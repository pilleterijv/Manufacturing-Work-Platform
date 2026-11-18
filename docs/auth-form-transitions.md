# Blank forms when setting an initial password

The sign-in and required temporary-password-change screens previously shared one uncontrolled form. React reused the inputs during the screen transition. A typed username/password could therefore remain in the next screen; returning from password setup could display a previous password in the username input. This was reproduced without a saved-password manager.

The forms now have separate identities. Switching to password setup creates blank temporary/new-password inputs. Completing the change creates a new, blank sign-in form with an unchecked remember-device choice. Registration and password-recovery forms also have separate identities. A failed submission within the same screen does not unnecessarily erase entries.

The temporary-password field does not request password autofill; the new-password field uses the new-password autocomplete hint. Sign-in keeps the normal username/current-password hints so users can deliberately use approved password managers. Browsers and extensions may still offer or insert saved credentials; the fix prevents the app itself from reusing credentials across screens.

The password-change API continues to preserve the username, hash the new password and revoke sessions. No database migration or account recreation is needed for this fix. Update source, rebuild using the existing installation's startup procedure and refresh the browser.

Regression coverage: synthetic account in a disposable local database; real UI login with a temporary password; blank inputs and detached old nodes at the transition; password change; blank returned username/password and unchecked remember setting; unchanged account username and revoked session; successful login with replacement password; blank logout fields; isolated registration/recovery fields. Screenshots contain blank fields only.
