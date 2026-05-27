/**
 * create-course.js - לוגיקת יצירת ועריכת קורסים
 * =================================================
 * קובץ זה מנהל את עמוד יצירת/עריכת קורס (create-course.html).
 *
 * תכונות:
 * 1. יצירת קורס חדש – כולל כותרת, תיאור, תמונה, קטגוריה ופרקים
 * 2. עריכת קורס קיים – טעינת נתונים מ-Firestore ועדכונם
 * 3. עוזר AI (Gemini) – צ'אט חכם לעזרה בניסוח תוכן
 * 4. מחולל סילבוס AI – יצירת רשימת פרקים אוטומטית לפי תיאור
 * 5. מחולל תמונת כריכה AI (Imagen) – יצירת תמונת קורס
 * 6. שליחת התראות – לרוכשי הקורס (בעדכון) או לעוקבים (ביצירה)
 *
 * זיהוי מצב עריכה: URL עם ?mode=edit&id=XXX
 */

/* ---------- ייבוא שירות קורסים ---------- */
import {
  createCourse,
  getCourseById,
  updateCourse,
} from "./firebase-course-service.js";

/* ---------- ייבוא Firestore ---------- */
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const db = getFirestore();

/* ================================================================
   חלק 1: זיהוי מצב עריכה וטעינת נתונים
   ================================================================ */

/** בדיקה האם נכנסנו במצב עריכה (URL: ?mode=edit&id=XXX) */
const urlParams = new URLSearchParams(window.location.search);
const editMode = urlParams.get("mode") === "edit";
const courseIdToEdit = urlParams.get("id");

/** אלמנטי DOM של הטופס */
const sectionsContainer = document.getElementById("sections-container");
const addSectionBtn = document.getElementById("addSectionBtn");
const pageTitle = document.querySelector("h1");
const submitBtn = document.querySelector(".submit-btn");

/* אם במצב עריכה – שינוי כותרת וטקסט כפתור, וטעינת הנתונים */
if (editMode && courseIdToEdit) {
  pageTitle.innerText = "עריכת קורס";
  submitBtn.innerText = "שמור שינויים";
  loadCourseForEdit(courseIdToEdit);
}

/**
 * loadCourseForEdit - טוען נתוני קורס קיים לטופס העריכה
 * @param {string} courseId - מזהה הקורס לעריכה
 *
 * ממלא את כל השדות: כותרת, תיאור, תמונה, קטגוריה, ופרקים.
 */
async function loadCourseForEdit(courseId) {
  try {
    const course = await getCourseById(courseId);

    /* מילוי שדות בסיסיים */
    document.getElementById("c-title").value = course.title;
    document.getElementById("c-desc").value = course.desc;
    document.getElementById("c-image").value = course.image;
    if (course.category) {
      document.getElementById("c-category").value = course.category;
    }

    /* ניקוי פרקים קיימים (ברירת מחדל) */
    sectionsContainer.innerHTML = "";

    /* מילוי שלבים ופרקים מנתוני הקורס */
    if (course.modules && course.modules.length > 0) {
      course.modules.forEach((mod) => {
        addModuleUI(mod);
      });
    } else if (course.sections && course.sections.length > 0) {
      /* תמיכה לאחור בפורמט פרקים בלבד (הפיכה לשלב יחיד) */
      const legacyModule = {
        title: "שלב 1",
        sections: course.sections
      };
      addModuleUI(legacyModule);
    } else {
      addModuleUI(); // פרק ריק
    }
  } catch (error) {
    console.error("שגיאה בטעינת הקורס לעריכה:", error);
    alert("שגיאה בטעינת הקורס לעריכה.");
  }
}

/* ================================================================
   חלק 2: ניהול פרקים (Sections) בטופס
   ================================================================ */

/**
 * ניהול שלבים (Modules) ופרקים (Chapters) באמצעות עורך טקסט עשיר Quill
 */
function addModuleUI(data = null) {
  const moduleIndex = sectionsContainer.children.length;
  const moduleDiv = document.createElement("div");
  moduleDiv.className = "module-item";
  moduleDiv.style.position = "relative"; // Fix Remove Module button globally positioning

  const moduleTitle = data ? (data.title || "שלב חדש") : `שלב ${moduleIndex + 1}`;

  moduleDiv.innerHTML = `
    <h4>
      <input type="text" class="mod-title input-title" value="${moduleTitle.replace(/"/g, '&quot;')}" style="border:none; border-bottom:1px solid #1691fd; font-size:1.1rem; color:#1691fd; background:transparent; width: 60%; font-weight:bold;">
      <button type="button" class="remove-section-btn" onclick="removeSectionSafe(this)">הסר שלב</button>
    </h4>
    <div class="module-chapters-container"></div>
    <button type="button" class="add-chapter-btn" onclick="addChap(this)">+ הוסף פרק לשלב זה</button>
  `;

  sectionsContainer.appendChild(moduleDiv);

  const chaptersContainer = moduleDiv.querySelector(".module-chapters-container");

  if (data && data.sections && data.sections.length > 0) {
    data.sections.forEach(sec => addChapterUI(chaptersContainer, sec));
  } else {
    addChapterUI(chaptersContainer);
  }
}

window.addChap = function(btn) {
  const container = btn.previousElementSibling;
  addChapterUI(container);
};

function addChapterUI(container, data = null) {
  const chapterDiv = document.createElement("div");
  chapterDiv.className = "section-item"; // Reuse old CSS

  const titleVal = data && data.title ? data.title.replace(/"/g, '&quot;') : "";
  const videoVal = data && data.videoUrl ? data.videoUrl.replace(/"/g, '&quot;') : "";
  const contentVal = data && data.content ? data.content : "";
  const idPrefix = 'editor-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  chapterDiv.innerHTML = `
    <div style="position: absolute; left: 10px; top: 15px; display: flex; gap: 5px;">
        <button type="button" class="remove-section-btn" style="position: static; background:#2196F3;" onclick="moveChapterDown(this)" title="העבר למטה"><i class="fas fa-arrow-down"></i></button>
        <button type="button" class="remove-section-btn" style="position: static; background:#2196F3;" onclick="moveChapterUp(this)" title="העבר למעלה"><i class="fas fa-arrow-up"></i></button>
        <button type="button" class="remove-section-btn" style="position: static; background:#ff9800;" onclick="removeSectionSafe(this)">הסר פרק</button>
    </div>
    <div class="form-group" style="padding-top: 10px;">
        <label>כותרת הפרק:</label>
        <input type="text" class="sec-title" required value="${titleVal}" placeholder="למשל: יסודות החוקים">
    </div>
    <div class="form-group">
        <label style="font-weight: normal;">קישור לוידאו (YouTube Embed):</label>
        <input type="url" class="sec-video" value="${videoVal}" placeholder="https://www.youtube.com/embed/...">
        
        <label style="font-weight: normal; margin-top: 15px;">תוכן כתוב (כולל אפשרויות עיצוב וקוד):</label>
        <div id="${idPrefix}" style="background:white; border-radius: 0 0 8px 8px;"></div>
    </div>
  `;

  container.appendChild(chapterDiv);

  const quillContainer = document.getElementById(idPrefix);
  if (quillContainer) {
    quillContainer.innerHTML = contentVal;
    const quill = new Quill(quillContainer, {
      theme: 'snow',
      modules: {
        syntax: true, // requires highlight.js
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'color': [] }, { 'background': [] }],
          ['blockquote', 'code-block'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'direction': 'rtl' }],
          ['clean']
        ]
      }
    });
    chapterDiv.quillInstance = quill;
  }
}

window.removeSectionSafe = function (btn) {
  if (confirm("האם למחוק? פעולה זו תסיר את התוכן.")) {
    btn.parentElement.parentElement.remove();
  }
};

window.moveChapterUp = function(btn) {
  const chapterDiv = btn.closest('.section-item');
  const prevChapter = chapterDiv.previousElementSibling;
  
  if (prevChapter && prevChapter.classList.contains('section-item')) {
    chapterDiv.parentNode.insertBefore(chapterDiv, prevChapter);
  } else {
    const currentModule = chapterDiv.closest('.module-item');
    const prevModule = currentModule.previousElementSibling;
    if (prevModule && prevModule.classList.contains('module-item')) {
      const prevContainer = prevModule.querySelector('.module-chapters-container');
      prevContainer.appendChild(chapterDiv);
    }
  }
};

window.moveChapterDown = function(btn) {
  const chapterDiv = btn.closest('.section-item');
  const nextChapter = chapterDiv.nextElementSibling;
  
  if (nextChapter && nextChapter.classList.contains('section-item')) {
    chapterDiv.parentNode.insertBefore(nextChapter, chapterDiv);
  } else {
    const currentModule = chapterDiv.closest('.module-item');
    const nextModule = currentModule.nextElementSibling;
    if (nextModule && nextModule.classList.contains('module-item')) {
      const nextContainer = nextModule.querySelector('.module-chapters-container');
      nextContainer.insertBefore(chapterDiv, nextContainer.firstChild);
    }
  }
};

if (addSectionBtn) {
  addSectionBtn.innerText = "+ הוסף שלב (Module)";
  addSectionBtn.addEventListener("click", () => addModuleUI());
  if (!editMode && sectionsContainer.children.length === 0) addModuleUI();
}

window.addSectionUI = addModuleUI; // For AI Generator compatibility

/* ================================================================
   חלק 3: שליחת הטופס (יצירה או עדכון)
   ================================================================ */

/**
 * מאזין ל-submit של הטופס.
 * מזהה אוטומטית אם זו יצירה או עריכה לפי editMode.
 *
 * ביצירה: שומר קורס חדש + מתריע לעוקבים
 * בעריכה: מעדכן קורס קיים + מתריע לרוכשים (אם יש הודעה)
 */
document
  .getElementById("createCourseForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    /* בדיקת התחברות */
    const user = window.auth?.currentUser;
    if (!user) {
      alert("עליך להתחבר כדי לבצע פעולה זו");
      return;
    }

    /* איסוף נתונים בסיסיים מהטופס */
    const title = document.getElementById("c-title").value;
    const description = document.getElementById("c-desc").value;
    const image =
      document.getElementById("c-image").value ||
      "https://via.placeholder.com/300?text=No+Image";
    const category = document.getElementById("c-category").value;

    /* איסוף שלבים (Modules) */
    const moduleElements = document.querySelectorAll(".module-item");
    const modules = [];

    moduleElements.forEach((modEl) => {
      const modTitle = modEl.querySelector(".mod-title").value || "שלב";
      const chapterElements = modEl.querySelectorAll(".section-item");
      const sections = [];

      chapterElements.forEach((chapEl) => {
        const secTitle = chapEl.querySelector(".sec-title").value;
        const secVideo = chapEl.querySelector(".sec-video").value;
        
        let secContent = "";
        if (chapEl.quillInstance) {
           let html = chapEl.quillInstance.root.innerHTML;
           if (html === '<p><br></p>') html = '';
           secContent = html;
        }

        if (secTitle) {
          sections.push({
            title: secTitle,
            videoUrl: secVideo,
            content: secContent,
          });
        }
      });

      if (sections.length > 0) {
        modules.push({ title: modTitle, sections: sections });
      }
    });

    /* ולידציה: לפחות שלב אחד */
    if (modules.length === 0) {
      alert("יש להוסיף לפחות שלב ופרק אחד.");
      return;
    }

    /* נעילת כפתור השליחה */
    submitBtn.disabled = true;
    submitBtn.innerText = "מעבד...";

    try {
      const notifMsg =
        document.getElementById("c-notif-msg")?.value.trim() || "";
      const { createNotification } = await import("./notification-service.js");

      if (editMode && courseIdToEdit) {
        /* ====== מצב עריכה: עדכון קורס קיים ====== */
        const updatedData = {
          title: title,
          desc: description,
          image: image,
          category: category,
          modules: modules,
          /* לא מעדכנים authorId או createdAt – שומרים על הערכים המקוריים */
        };

        await updateCourse(courseIdToEdit, updatedData);

        /* שליחת התראה לרוכשי הקורס (אם המרצה כתב הודעה) */
        if (notifMsg) {
          const usersSnap = await getDocs(collection(db, "users"));
          const promises = [];
          usersSnap.forEach((uDoc) => {
            const data = uDoc.data();
            if (
              data.purchasedCourses &&
              data.purchasedCourses.includes(courseIdToEdit)
            ) {
              promises.push(
                createNotification(
                  uDoc.id,
                  "course_update",
                  { courseName: title, customMessage: notifMsg },
                  `course.html?id=${courseIdToEdit}`,
                ),
              );
            }
          });
          await Promise.all(promises);
        }

        alert("הקורס עודכן בהצלחה!");
        window.location.href = `course.html?id=${courseIdToEdit}`;
      } else {
        /* ====== מצב יצירה: קורס חדש ====== */
        const newCourse = {
          title: title,
          desc: description,
          image: image,
          category: category,
          authorId: user.uid,
          authorName: user.displayName || "לא ידוע",
          modules: modules,
          createdAt: new Date(),
        };

        const newId = await createCourse(newCourse);

        /* שליחת התראה לעוקבים של המרצה */
        const authorDocSnap = await getDoc(doc(db, "users", user.uid));
        if (authorDocSnap.exists()) {
          const followers = authorDocSnap.data().followers || [];
          const promises = followers.map((followerId) =>
            createNotification(
              followerId,
              "new_course",
              {
                authorName: user.displayName || "המרצה שאתה עוקב אחריו",
                courseName: title,
                customMessage: notifMsg,
              },
              `course.html?id=${newId}`,
            ),
          );
          await Promise.all(promises);
        }

        alert("הקורס נוצר בהצלחה!");
        window.location.href = `course.html?id=${newId}`;
      }
    } catch (error) {
      console.error("שגיאה בשמירת הקורס:", error);
      alert("שגיאה בשמירת הקורס: " + error.message);
      submitBtn.disabled = false;
      submitBtn.innerText = editMode ? "שמור שינויים" : "צור קורס";
    }
  });

/* ================================================================
   חלק 4: עוזר AI (צ'אט Gemini)
   ================================================================
   פאנל צד עם צ'אט חכם שעוזר למרצה לנסח תוכן.
   משתמש ב-ai-service.js לתקשורת עם Gemini API.
*/

/* ---------- ייבוא שירות AI ---------- */
import {
  getApiKey,
  saveApiKey,
  sendChatMessage,
  generateImage,
} from "./ai-service.js";

/* ---------- אלמנטי DOM של פאנל ה-AI ---------- */
const aiFabBtn = document.getElementById("aiFabBtn");           // כפתור פתיחה (FAB)
const aiSidePanel = document.getElementById("aiSidePanel");     // הפאנל עצמו
const aiCloseBtn = document.getElementById("aiCloseBtn");       // כפתור סגירה
const aiSettingsBtn = document.getElementById("aiSettingsBtn");  // כפתור הגדרות
const aiSettingsArea = document.getElementById("aiSettingsArea"); // אזור הגדרות API
const aiApiKeyInput = document.getElementById("aiApiKeyInput"); // שדה מפתח API
const aiSaveApiKeyBtn = document.getElementById("aiSaveApiKeyBtn"); // שמירת מפתח
const aiChatMessages = document.getElementById("aiChatMessages"); // אזור ההודעות
const aiChatInput = document.getElementById("aiChatInput");     // שדה קלט
const aiSendBtn = document.getElementById("aiSendBtn");         // כפתור שליחה
const aiQuickActions = document.querySelectorAll(".ai-quick-action"); // פעולות מהירות

/** היסטוריית שיחה – כוללת הוראת מערכת */
let aiConversation = [
  {
    role: "system",
    content:
      "אתה עוזר וירטואלי חכם ומומחה ביצירת קורסים דיגיטליים. תפקידך לעזור למרצה לנסח תוכן, כותרות, והסברים ברמה קולחת, מקצועית ובעברית. תהיה קצר וקולע אלא אם התבקשת להרחיב.",
  },
];

/* פתיחה/סגירה של פאנל ה-AI */
if (aiFabBtn && aiSidePanel && aiCloseBtn) {
  aiFabBtn.addEventListener("click", () => {
    aiSidePanel.classList.add("open");
  });
  aiCloseBtn.addEventListener("click", () => {
    aiSidePanel.classList.remove("open");
  });
}

/* ניהול הגדרות (מפתח API) */
if (aiSettingsBtn && aiSettingsArea && aiSaveApiKeyBtn && aiApiKeyInput) {
  /* פתיחה/סגירה של אזור ההגדרות */
  aiSettingsBtn.addEventListener("click", () => {
    aiSettingsArea.style.display =
      aiSettingsArea.style.display === "none" ? "block" : "none";
    aiApiKeyInput.value = getApiKey();
  });

  /* שמירת מפתח API */
  aiSaveApiKeyBtn.addEventListener("click", () => {
    const key = aiApiKeyInput.value.trim();
    if (saveApiKey(key)) {
      alert("המפתח נשמר בהצלחה!");
      aiSettingsArea.style.display = "none";
    } else {
      alert("אנא הזן מפתח תקין.");
    }
  });
}

/**
 * appendMessage - מוסיף הודעה לאזור הצ'אט
 * @param {string} role - "user" או "assistant"
 * @param {string} content - תוכן ההודעה
 */
function appendMessage(role, content) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `ai-message ${role === "user" ? "user-message" : "assistant-message"}`;
  /* המרת ירידות שורה להצגה תקינה או שימוש ב-marked אם קיים */
  msgDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content.replace(/\n/g, "<br>");
  aiChatMessages.appendChild(msgDiv);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

/**
 * showTypingIndicator - מציג אנימציית "מקליד..." בצ'אט
 */
function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "ai-message assistant-message typing-container";
  indicator.id = "aiTypingIndicator";
  indicator.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  aiChatMessages.appendChild(indicator);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

/**
 * removeTypingIndicator - מסיר את אנימציית ה-"מקליד..."
 */
function removeTypingIndicator() {
  const indicator = document.getElementById("aiTypingIndicator");
  if (indicator) {
    indicator.remove();
  }
}

/**
 * handleSendMsg - מטפל בשליחת הודעה לצ'אט AI
 * @param {string} text - טקסט ההודעה לשליחה
 *
 * השלבים:
 * 1. הוספת ההודעה לממשק ולהיסטוריה
 * 2. הצגת אנימציית "מקליד..."
 * 3. שליחה ל-Gemini API
 * 4. הצגת התשובה
 */
async function handleSendMsg(text) {
  if (!text) return;

  /* בדיקת מפתח API */
  if (!getApiKey()) {
    alert(
      "אנא הגדר מפתח Gemini API בהגדרות (סמל גלגל השיניים) לפני שליחת הודעה.",
    );
    aiSettingsArea.style.display = "block";
    return;
  }

  /* שלב 1: הוספה לממשק ולהיסטוריה */
  appendMessage("user", text);
  aiConversation.push({ role: "user", content: text });

  /* שלב 2: ניקוי הקלט ונעילת כפתור */
  aiChatInput.value = "";
  aiSendBtn.disabled = true;

  /* שלב 3: אנימציית "מקליד..." */
  showTypingIndicator();

  /* שלב 4: שליחה ל-API */
  try {
    const aiResponseText = await sendChatMessage(aiConversation);
    removeTypingIndicator();

    appendMessage("assistant", aiResponseText);
    aiConversation.push({ role: "assistant", content: aiResponseText });
  } catch (error) {
    removeTypingIndicator();
    console.error("שגיאת AI:", error);
    appendMessage(
      "assistant",
      `❌ שגיאה: ${error.message === "API_KEY_MISSING" ? "חסר מפתח API" : "לא ניתן להתחבר לשרת כרגע."}`,
    );
  } finally {
    aiSendBtn.disabled = false;
  }
}

/* מאזיני שליחה – כפתור ו-Enter */
if (aiSendBtn && aiChatInput) {
  aiSendBtn.addEventListener("click", () =>
    handleSendMsg(aiChatInput.value.trim()),
  );

  aiChatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMsg(aiChatInput.value.trim());
    }
  });
}

/* פעולות מהירות (Quick Actions) – כפתורים מוכנים עם prompt */
aiQuickActions.forEach((btn) => {
  btn.addEventListener("click", () => {
    const prompt = btn.getAttribute("data-prompt");
    if (prompt) {
      handleSendMsg(prompt);
    }
  });
});

/* ================================================================
   חלק 5: מחולל סילבוס AI
   ================================================================
   מאפשר למרצה לתאר את הקורס בטקסט חופשי,
   וה-AI יוצר מערך פרקים אוטומטי (JSON) ומכניס לטופס.
*/

const aiGenerateSyllabusBtn = document.getElementById("aiGenerateSyllabusBtn");
const aiSyllabusModalOverlay = document.getElementById("aiSyllabusModalOverlay");
const aiSyllabusCloseBtn = document.getElementById("aiSyllabusCloseBtn");
const aiSyllabusConfirmBtn = document.getElementById("aiSyllabusConfirmBtn");
const aiSyllabusPrompt = document.getElementById("aiSyllabusPrompt");
const aiSyllabusLoading = document.getElementById("aiSyllabusLoading");

if (aiGenerateSyllabusBtn && aiSyllabusModalOverlay) {
  /* פתיחת חלון מחולל הסילבוס */
  aiGenerateSyllabusBtn.addEventListener("click", () => {
    aiSyllabusPrompt.value = "";
    aiSyllabusLoading.style.display = "none";
    aiSyllabusModalOverlay.style.display = "flex";
  });

  /* סגירת החלון */
  aiSyllabusCloseBtn.addEventListener("click", () => {
    aiSyllabusModalOverlay.style.display = "none";
  });

  /**
   * יצירת סילבוס:
   * 1. שולח הוראת מערכת + תיאור הקורס ל-Gemini
   * 2. Gemini מחזיר JSON עם מערך פרקים
   * 3. מפרסר את ה-JSON ומכניס כפרקים לטופס
   */
  aiSyllabusConfirmBtn.addEventListener("click", async () => {
    const promptText = aiSyllabusPrompt.value.trim();
    if (!promptText) {
      alert("אנא ספר לי קצת על הקורס כדי שאוכל לעזור.");
      return;
    }

    /* בדיקת מפתח API */
    if (!getApiKey()) {
      alert(
        "אנא הגדר מפתח Gemini API בהגדרות ה-AI (הרובוט בפינה למטה) קודם כל.",
      );
      aiSyllabusModalOverlay.style.display = "none";
      const aiSidePanel = document.getElementById("aiSidePanel");
      if (aiSidePanel) aiSidePanel.classList.add("open");
      const aiSettingsArea = document.getElementById("aiSettingsArea");
      if (aiSettingsArea) aiSettingsArea.style.display = "block";
      return;
    }

    aiSyllabusLoading.style.display = "block";
    aiSyllabusConfirmBtn.disabled = true;

    try {
      /* בניית הודעות עם הוראת מערכת לייצור JSON */
      const messages = [
        {
          role: "system",
          content: `You are an expert curriculum designer. The user will give you a topic or a brief description of a course they want to teach.
Your job is to generate a comprehensive syllabus. The syllabus must be divided into logical stages (modules), and each stage must contain multiple lessons (sections).
You MUST respond ONLY with a valid JSON array of objects representing the modules. Do not include markdown codeblocks or any additional text.
Each module object must have:
1. "title" (the name of the stage in Hebrew)
2. "sections" (an array of lesson objects for this stage)
Each lesson object within "sections" must have:
1. "title" (lesson title in Hebrew)
2. "content" (A highly detailed explanation of the lesson's topic, practical tasks, and examples. REQUIRED: It must be formatted as rich HTML using <p>, <strong>, <ul>, and <pre class="ql-syntax" spellcheck="false"> for code blocks if applicable. Write everything in Hebrew).`,
        },
        { role: "user", content: promptText },
      ];

      const aiResponseText = await sendChatMessage(messages);

      /* ניסיון לפרסר את ה-JSON */
      let parsedSyllabus = [];
      try {
        /* ניקוי אם המודל החזיר Markdown ticks */
        const cleanContent = aiResponseText
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        parsedSyllabus = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error("שגיאה בפירסור JSON של הסילבוס:", parseError, aiResponseText);
        throw new Error("התשובה מהשרת לא הייתה בפורמט תקין. אנא נסה שוב.");
      }

      /* הכנסת הפרקים לטופס */
      if (Array.isArray(parsedSyllabus) && parsedSyllabus.length > 0) {
        /* ניקוי פרקים קיימים אם ריקים */
        const currentSections = document.getElementById("sections-container");
        if (currentSections && currentSections.innerText.trim() === "") {
          currentSections.innerHTML = "";
        }

        /* הוספת כל פרק מה-AI לטופס */
        parsedSyllabus.forEach((sec) => {
          if (typeof window.addSectionUI === "function") {
            window.addSectionUI(sec);
          } else {
            console.warn("addSectionUI לא חשוף גלובלית.");
          }
        });

        aiSyllabusModalOverlay.style.display = "none";
        alert("הסילבוס נוצר והתווסף לקורס בהצלחה! תוכל לערוך אותו עכשיו.");
      } else {
        throw new Error("התקבל מערך ריק מה-AI.");
      }
    } catch (error) {
      console.error("שגיאה במחולל הסילבוס:", error);
      alert("שגיאה ביצירת הסילבוס: " + error.message);
    } finally {
      aiSyllabusLoading.style.display = "none";
      aiSyllabusConfirmBtn.disabled = false;
    }
  });
}

/* ================================================================
   חלק 6: מחולל תמונת כריכה AI (Imagen 3)
   ================================================================
   מאפשר למרצה לתאר את תמונת הכריכה הרצויה,
   ומייצר אותה באמצעות Imagen API.
   התמונה מוחזרת כ-Data URL ומוצבת בשדה התמונה.
*/

const aiGenCoverBtn = document.getElementById("aiGenCoverBtn");
const aiCoverModalOverlay = document.getElementById("aiCoverModalOverlay");
const aiCoverCloseBtn = document.getElementById("aiCoverCloseBtn");
const aiCoverConfirmBtn = document.getElementById("aiCoverConfirmBtn");
const aiCoverPrompt = document.getElementById("aiCoverPrompt");
const aiCoverLoading = document.getElementById("aiCoverLoading");
const coverPreview = document.getElementById("coverPreview");
const coverPreviewImg = document.getElementById("coverPreviewImg");
const cImageInput = document.getElementById("c-image");

if (aiGenCoverBtn && aiCoverModalOverlay) {
  /* פתיחת חלון מחולל התמונה */
  aiGenCoverBtn.addEventListener("click", () => {
    aiCoverPrompt.value = "";
    aiCoverLoading.style.display = "none";
    aiCoverModalOverlay.style.display = "flex";
  });

  /* סגירת החלון */
  aiCoverCloseBtn.addEventListener("click", () => {
    aiCoverModalOverlay.style.display = "none";
  });

  /**
   * יצירת תמונת כריכה:
   * 1. בונה prompt מקצועי עם התיאור של המרצה
   * 2. שולח ל-Imagen API
   * 3. מציב את התמונה בשדה הקלט ובתצוגה מקדימה
   */
  aiCoverConfirmBtn.addEventListener("click", async () => {
    const desc = aiCoverPrompt.value.trim();
    if (!desc) {
      alert("אנא תאר את תמונת הכריכה שאתה רוצה.");
      return;
    }

    /* בדיקת מפתח API */
    if (!getApiKey()) {
      alert(
        "אנא הגדר מפתח Gemini API בהגדרות ה-AI (הרובוט בפינה למטה) קודם כל.",
      );
      aiCoverModalOverlay.style.display = "none";
      const panel = document.getElementById("aiSidePanel");
      if (panel) panel.classList.add("open");
      const settings = document.getElementById("aiSettingsArea");
      if (settings) settings.style.display = "block";
      return;
    }

    aiCoverLoading.style.display = "block";
    aiCoverConfirmBtn.disabled = true;

    try {
      /* בניית prompt מקצועי באנגלית ליצירת תמונה */
      const fullPrompt = `Professional online course cover image: ${desc}. High quality, modern design, clean composition, suitable as a course thumbnail.`;
      const imageUrl = await generateImage(fullPrompt);

      /* הצבת התמונה בשדה הקלט */
      if (cImageInput) cImageInput.value = imageUrl;

      /* הצגת תצוגה מקדימה */
      if (coverPreview && coverPreviewImg) {
        coverPreviewImg.src = imageUrl;
        coverPreview.style.display = "block";
      }

      aiCoverModalOverlay.style.display = "none";
      alert("התמונה נוצרה והושתלה בהצלחה! תוכל לשנות אותה ידנית אם תרצה.");
    } catch (error) {
      console.error("שגיאה במחולל תמונת כריכה:", error);
      alert("שגיאה ביצירת התמונה: " + error.message);
    } finally {
      aiCoverLoading.style.display = "none";
      aiCoverConfirmBtn.disabled = false;
    }
  });
}
