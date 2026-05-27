/**
 * auth.js - ליבת ההזדהות ואתחול Firebase
 * =========================================
 * זהו הקובץ הראשי והקריטי ביותר באתר.
 * הוא רץ בכל דף ואחראי על:
 *
 * 1. אתחול Firebase (App, Auth, Firestore) – חד-פעמי
 * 2. חשיפת window.auth ו-window.db לקבצים אחרים
 * 3. ניהול דף ההתחברות/הרשמה (auth.html)
 * 4. הזדהות עם אימייל+סיסמה וגם Google OAuth
 * 5. עדכון ה-Navbar לפי מצב ההזדהות (מחובר/אורח)
 * 6. טעינת והצגת התראות בפעמון
 * 7. הוספת כפתורים דינמיים לפי תפקיד (מרצה → "יצירת קורס", מנהל → "תיבת פניות")
 * 8. עדכון סקציית ה-Hero בדף הבית לפי מצב ההתחברות
 *
 * ⚠️ חשוב: קובץ זה חייב להיטען לפני כל קובץ JS אחר שמשתמש ב-Firebase.
 */

/* ================================================================
   חלק 1: אתחול Firebase
   ================================================================ */

/* ייבוא Firebase SDK */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";

/* ייבוא פונקציות אימות (Authentication) */
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

/* ייבוא פונקציות מסד נתונים (Firestore) */
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * הגדרות Firebase – מזהי הפרויקט ב-Firebase Console
 * ⚠️ לא לשנות ערכים אלו ללא תיאום!
 */
const firebaseConfig = {
  apiKey: "AIzaSyDjaxJkR-KeiVLPooHotVTpB0Ub16_td6U",
  authDomain: "school-pro-21e93.firebaseapp.com",
  projectId: "school-pro-21e93",
  storageBucket: "school-pro-21e93.firebasestorage.app",
  messagingSenderId: "975277630876",
  appId: "1:975277630876:web:49a66bb4fe8ff40bce9459",
  measurementId: "G-YE2SDDCXVV",
};

/* אתחול Firebase App, Auth ו-Firestore */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * חשיפת משתנים גלובליים – כל שאר הקבצים ניגשים ל-Firebase דרכם.
 * window.auth = מופע Auth (הזדהות)
 * window.db   = מופע Firestore (מסד נתונים)
 * window.provider = ספק Google OAuth
 */
window.auth = auth;
window.db = db;
window.provider = new GoogleAuthProvider();

/* ================================================================
   חלק 2: לוגיקת דף ההתחברות/הרשמה (auth.html)
   ================================================================ */

/** מצב נוכחי: true = התחברות, false = הרשמה */
let isLoginMode = true;

/**
 * updateAuthUI - מעדכן את ממשק דף ההתחברות בין מצב התחברות להרשמה
 * משנה: כותרת, טקסט כפתור, הצגת שדה שם, טקסט מעבר
 */
function updateAuthUI() {
  const authTitle = document.getElementById("auth-title");
  const mainBtn = document.getElementById("mainAuthBtn");
  const nameInput = document.getElementById("displayName");
  const switchMsg = document.getElementById("switch-msg");

  if (!authTitle || !mainBtn) return;

  if (isLoginMode) {
    authTitle.innerText = "התחברות";
    mainBtn.innerText = "התחבר";
    nameInput.classList.add("hidden");
    switchMsg.innerHTML =
      'עוד לא רשום? <span id="toggleAuth">צור חשבון חדש</span>';
  } else {
    authTitle.innerText = "יצירת חשבון";
    mainBtn.innerText = "הירשם עכשיו";
    nameInput.classList.remove("hidden");
    switchMsg.innerHTML =
      'כבר יש לך חשבון? <span id="toggleAuth">התחבר כאן</span>';
  }
}

/* מאזין ללחיצה על "החלף מצב" – מחליף בין התחברות להרשמה */
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "toggleAuth") {
    isLoginMode = !isLoginMode;
    updateAuthUI();
  }
});

/* ================================================================
   חלק 3: כפתור התחברות/הרשמה ראשי
   ================================================================ */

const mainBtn = document.getElementById("mainAuthBtn");
if (mainBtn) {
  mainBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const name = document.getElementById("displayName").value;

    try {
      if (isLoginMode) {
        /* --- מצב התחברות --- */
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        /* --- מצב הרשמה --- */
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const user = userCredential.user;

        /* עדכון שם התצוגה ב-Firebase Auth */
        await updateProfile(user, { displayName: name });

        /* יצירת מסמך משתמש ב-Firestore עם תפקיד ברירת מחדל (סטודנט) */
        await setDoc(doc(db, "users", user.uid), {
          email: email,
          role: "student",  // ברירת מחדל – ניתן לשנות ידנית ב-Firebase Console
          name: name,
          createdAt: new Date(),
        });
      }

      /* הפניה – לעמוד ה-redirect אם צוין, אחרת לדף הבית */
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get("redirect");
      window.location.href = redirectUrl
        ? decodeURIComponent(redirectUrl)
        : "main.html";
    } catch (error) {
      alert("שגיאה: " + error.message);
    }
  });
}

/* ================================================================
   חלק 4: התחברות עם Google (OAuth)
   ================================================================ */

const googleBtn = document.getElementById("googleLoginBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, window.provider);
      const user = result.user;

      /* יצירת מסמך משתמש אם זו הפעם הראשונה (לא קיים כבר) */
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          email: user.email || "",
          role: "student",
          name: user.displayName || "משתמש חדש",
          createdAt: new Date(),
        });
      }

      /* הפניה */
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get("redirect");
      window.location.href = redirectUrl
        ? decodeURIComponent(redirectUrl)
        : "main.html";
    } catch (error) {
      console.error("שגיאת Google Auth:", error);
      alert(
        "שגיאה בהתחברות עם גוגל: " +
          error.message +
          "\n(ודא שהתחברות דרך Google מופעלת במסוף של Firebase ומוגדרות הרשאות Domain)",
      );
    }
  });
}

/* בדיקת פרמטר URL – אם ?mode=signup, פותח ישירות במצב הרשמה */
window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("mode") === "signup") {
    isLoginMode = false;
    updateAuthUI();
  }
});

/* ================================================================
   חלק 5: מאזין מרכזי לשינויי מצב הזדהות (onAuthStateChanged)
   ================================================================
   פונקציה זו רצה בכל פעם שהמשתמש מתחבר, מתנתק,
   או כשהדף נטען מחדש. היא אחראית על עדכון כל רכיבי ה-UI
   בכל דף באתר.
*/
onAuthStateChanged(auth, async (user) => {
  /* ---------- אלמנטי Navbar ---------- */
  const navButton = document.getElementById("navAuthBtn");
  const authActionBtn = document.getElementById("authActionBtn");
  const userAvatar = document.getElementById("user-avatar");
  const navAuthButtons = document.getElementById("navAuthButtons");
  const userMenu = document.querySelector(".user-menu");

  /* ---------- אלמנטי Hero (דף הבית) ---------- */
  const heroActionButton = document.getElementById("heroActionButton");
  const heroLinkTag = document.getElementById("heroLinkTag");
  const welcomeMsg = document.getElementById("welcome-msg");
  const heroDesc = document.querySelector(".hero-content p");

  if (user) {
    /* ====== משתמש מחובר ====== */
    const userName = user.displayName || user.email.split("@")[0];

    /* הצגת תפריט משתמש, הסתרת כפתורי אורח */
    if (userMenu) userMenu.style.display = "";
    if (navAuthButtons) navAuthButtons.style.display = "none";

    /* הצגת תפריט התראות (פעמון) */
    const notifMenu = document.getElementById("notification-menu");
    if (notifMenu) notifMenu.style.display = "inline-block";

    /* עדכון שם משתמש ותמונה ב-Navbar */
    if (navButton) navButton.innerHTML = `${userName} ▼`;
    if (userAvatar && user.photoURL) userAvatar.src = user.photoURL;

    /* כפתור "התנתק" בתפריט */
    if (authActionBtn) {
      authActionBtn.innerHTML = "התנתק";
      authActionBtn.onclick = (e) => {
        e.preventDefault();
        signOut(auth).then(() => (window.location.href = "main.html"));
      };
    }

    /* ---------- טעינת התראות ---------- */
    import("./notification-service.js").then((notifService) => {
      notifService
        .getUserNotifications(user.uid)
        .then((notifications) => {
          const badge = document.getElementById("notif-badge");
          const listHtml = document.getElementById("notif-list");

          if (!listHtml) return;

          let unreadCount = 0;
          if (notifications.length === 0) {
            listHtml.innerHTML =
              '<div style="padding: 15px; text-align: center; color: #777;">אין התראות חדשות</div>';
          } else {
            /* רינדור רשימת ההתראות */
            let htmlContent = notifications
              .map((n) => {
                if (!n.isRead) unreadCount++;
                const timeStr = n.createdAt?.toDate
                  ? n.createdAt.toDate().toLocaleString("he-IL")
                  : "";

                /* תיקון קישורים ישנים */
                const safeLink = (n.link || "").replace(
                  "whats-new.html",
                  "site-updates.html",
                );

                return `
                  <a href="${safeLink}" class="notif-item ${n.isRead ? "" : "unread"}" data-id="${n.id}">
                    <div class="notif-text">${n.message}</div>
                    <div class="notif-time">${timeStr}</div>
                  </a>
                `;
              })
              .join("");

            /* כפתור "סמן הכל כנקרא" – מופיע רק אם יש התראות שלא נקראו */
            if (unreadCount > 0) {
              htmlContent =
                `<div style="text-align: left; padding: 5px 15px; border-bottom: 1px solid #eee;">
                                  <button id="mark-all-read-btn" style="background: none; border: none; color: #1691fd; cursor: pointer; font-size: 0.85rem; padding: 0;">✔ סמן הכל כנקרא</button>
                               </div>` + htmlContent;
            }
            listHtml.innerHTML = htmlContent;
          }

          /* עדכון תג מספר ההתראות שלא נקראו (badge) */
          if (badge) {
            if (unreadCount > 0) {
              badge.textContent = unreadCount;
              badge.style.display = "inline-block";
            } else {
              badge.style.display = "none";
            }
          }

          /* מאזין ללחיצה על התראה בודדת – סימון כנקראה וניווט */
          document.querySelectorAll(".notif-item").forEach((item) => {
            item.addEventListener("click", async (e) => {
              const notifId = item.getAttribute("data-id");
              const href = item.getAttribute("href");

              if (notifId && item.classList.contains("unread")) {
                e.preventDefault();
                item.classList.remove("unread");
                try {
                  await notifService.markNotificationAsRead(user.uid, notifId);
                } catch (error) {
                  console.error("שגיאה בעדכון התראה:", error);
                }
                if (href && href !== "#") {
                  window.location.href = href;
                }
              }
            });
          });

          /* מאזין ללחיצה על "סמן הכל כנקרא" */
          const markAllBtn = document.getElementById("mark-all-read-btn");
          if (markAllBtn) {
            markAllBtn.addEventListener("click", async () => {
              markAllBtn.innerHTML = "מסמן...";
              const unreadItems =
                document.querySelectorAll(".notif-item.unread");
              const promises = Array.from(unreadItems).map((item) => {
                const notifId = item.getAttribute("data-id");
                item.classList.remove("unread");
                return notifService.markNotificationAsRead(user.uid, notifId);
              });
              await Promise.all(promises);
              if (badge) badge.style.display = "none";
              markAllBtn.parentElement.style.display = "none";
            });
          }
        })
        .catch((err) => console.error("שגיאה בטעינת התראות:", err));
    });

    /* ---------- בדיקת תפקיד והוספת כפתורים דינמיים ---------- */
    try {
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        /* מרצה – מקבל כפתור "יצירת קורס" בתפריט */
        if (userData.role === "lecturer") {
          addCreateCourseButton();
        }
        /* מנהל – מקבל כפתור "תיבת פניות" בתפריט */
        if (userData.role === "owner") {
          addOwnerInboxButton();
        }
      }
    } catch (err) {
      console.error("שגיאה בשליפת תפקיד:", err);
    }

    /* ---------- עדכון Hero (דף הבית) ---------- */
    if (heroActionButton) heroActionButton.innerHTML = "התחל ללמוד";
    if (heroLinkTag) heroLinkTag.href = "all-courses.html";
    if (welcomeMsg) {
      welcomeMsg.innerHTML = `שלום, ${userName}`;
      welcomeMsg.style.display = "block";
      if (heroDesc) heroDesc.style.display = "none";
    }

    /* שידור אירוע מותאם אישית – קבצים אחרים יכולים להאזין אליו */
    window.dispatchEvent(new CustomEvent("user-ready", { detail: user }));
  } else {
    /* ====== מצב אורח (לא מחובר) ====== */

    if (userMenu) userMenu.style.display = "none";
    if (navAuthButtons) navAuthButtons.style.display = "flex";

    if (navButton) navButton.innerHTML = "אורח/ת ▼";
    if (authActionBtn) {
      authActionBtn.innerHTML = "התחבר";
      authActionBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = "auth.html";
      };
    }

    /* עדכון Hero לאורח */
    if (heroActionButton) heroActionButton.innerHTML = "הצטרף בחינם";
    if (heroLinkTag) heroLinkTag.href = "auth.html?mode=signup";

    /* שחזור טקסט ומראה ברירת מחדל */
    if (welcomeMsg) {
      welcomeMsg.style.display = "block";
      welcomeMsg.innerHTML = "פלטפורמת למידה מקוונת";
    }
    if (heroDesc) {
      heroDesc.style.display = "block";
    }

    /* הסרת כפתור "יצירת קורס" אם קיים */
    const createBtn = document.getElementById("nav-create-course-btn");
    if (createBtn) createBtn.remove();
  }
});

/* ================================================================
   חלק 6: פונקציות עזר להוספת כפתורים דינמיים ל-Navbar
   ================================================================ */

/**
 * addCreateCourseButton - מוסיף כפתור "יצירת קורס +" לתפריט המשתמש
 * מופיע רק למשתמשים עם תפקיד "lecturer" (מרצה).
 * הכפתור מוכנס לפני כפתור ההתנתקות בדרופדאון.
 */
function addCreateCourseButton() {
  const dropdownContent = document.getElementById("user-dropdown-content");
  /* בדיקה שהכפתור לא קיים כבר (למניעת כפילויות) */
  if (document.getElementById("nav-create-course-btn")) return;

  if (dropdownContent) {
    const btn = document.createElement("a");
    btn.id = "nav-create-course-btn";
    btn.href = "create-course.html";
    btn.innerText = "יצירת קורס +";
    btn.style.color = "#28a745"; // ירוק להדגשה
    btn.style.fontWeight = "bold";

    /* הכנסה לפני כפתור ההתנתקות */
    const logoutBtn = document.getElementById("authActionBtn");
    if (logoutBtn) {
      dropdownContent.insertBefore(btn, logoutBtn);
    } else {
      dropdownContent.appendChild(btn);
    }
  }
}

/**
 * addOwnerInboxButton - מוסיף כפתור "תיבת פניות" לתפריט המשתמש
 * מופיע רק למשתמשים עם תפקיד "owner" (מנהל/בעלים).
 */
function addOwnerInboxButton() {
  const dropdownContent = document.getElementById("user-dropdown-content");
  if (document.getElementById("nav-owner-inbox-btn")) return;

  if (dropdownContent) {
    const btn = document.createElement("a");
    btn.id = "nav-owner-inbox-btn";
    btn.href = "owner-inbox.html";
    btn.innerHTML = '<i class="fas fa-inbox"></i> תיבת פניות';
    btn.style.color = "#dc3545"; // אדום להדגשה
    btn.style.fontWeight = "bold";

    const logoutBtn = document.getElementById("authActionBtn");
    if (logoutBtn) {
      dropdownContent.insertBefore(btn, logoutBtn);
    } else {
      dropdownContent.appendChild(btn);
    }
  }
}
