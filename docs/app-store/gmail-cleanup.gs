/**
 * Keeps the privacy policy's promise that account emails leave the app's
 * Gmail account within 60 days: every day, anything older than 29 days goes
 * to the trash, and Gmail deletes the trash for good 30 days later.
 *
 * Run it only in trypowercouple@gmail.com, the account that sends the app's
 * emails: it trashes everything old in the account it runs in.
 *
 * Setup, once: signed in as trypowercouple@gmail.com, open
 * script.google.com and make a new project. Paste this file over the code
 * there and save. Choose setUp in the function menu and press Run, then allow
 * access when Google asks. Running setUp again is harmless; it replaces the
 * daily trigger.
 */

function setUp() {
  for (const trigger of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('deleteOldMail').timeBased().everyDays(1).create();
  deleteOldMail();
}

function deleteOldMail() {
  // Searches the inbox and sent mail, not the trash or spam, which Gmail
  // empties on its own after 30 days.
  let threads;
  do {
    threads = GmailApp.search('older_than:29d', 0, 100);
    if (threads.length > 0) GmailApp.moveThreadsToTrash(threads);
  } while (threads.length === 100);
}
