/**
 * navbar.js - תפריט ניווט עליון (Navbar)
 * ========================================
 * קובץ זה אחראי על:
 * 1. הזרקת ה-HTML של תפריט הניווט לכל דף באתר
 * 2. ניהול לחצן התראות (Notification Bell) – פתיחה/סגירה של הדרופדאון
 * 3. סגירת תפריטים פתוחים בלחיצה מחוץ לאזור שלהם
 *
 * הסקריפט מוזרק כ-<script src="navbar.js"> בכל דף HTML,
 * ומחפש אלמנט <nav id="main-nav"> כדי למלא אותו בתוכן.
 */

/* ================================================================
   חלק 1: מבנה ה-HTML של תפריט הניווט
   ================================================================ */
const navbarHTML = `
    <!-- לוגו האתר – קישור לדף הבית -->
    <a href="main.html" id="logo" style="text-decoration: none;"><span>Edu</span>com</a>

    <!-- קישורי ניווט ראשיים -->
    <ul class="links">
        <li><a href="main.html" style="text-decoration: none; color: inherit;">Home</a></li>

        <!-- דרופדאון קורסים – מציג קטגוריות בריחוף -->
        <li class="dropdown">
            <a href="all-courses.html" class="dropbtn">Courses <span class="arrow">▼</span></a>
            <div class="dropdown-content" id="nav-dropdown-list">
                <a href="all-courses.html?category=Programming">UX/UI Design</a>
                 <a href="all-courses.html?category=Programming">Python Programming</a>
                <a href="all-courses.html?category=Design">Data Analysis</a>
                <a href="all-courses.html?category=Marketing">Web Development</a>
            </div>
        </li>

        <li><a href="authors.html" style="text-decoration: none; color: inherit;">Lecturers</a></li>
        <li><a href="site-updates.html" style="text-decoration: none; color: inherit;">Site Updates</a></li>
        <li><a href="contact.html" style="text-decoration: none; color: inherit;">Contact</a></li>
    </ul>
    
    <!-- פעמון התראות – מוצג רק למשתמשים מחוברים (auth.js שולט על הנראות) -->
    <div class="dropdown notification-menu" id="notification-menu" style="display: none; margin-left: 15px;">
        <button id="navNotifBtn" class="dropbtn notif-bell-btn">
            <i class="fas fa-bell"></i>
            <!-- תג מספר ההתראות שלא נקראו -->
            <span class="notif-badge" id="notif-badge" style="display: none;">0</span>
        </button>
        <div class="dropdown-content notifications-dropdown" id="notifications-dropdown-content">
            <div class="notif-header">התראות שלי</div>
            <div class="notif-list" id="notif-list">
                <!-- ההתראות מוזרקות כאן דינמית ע"י auth.js -->
                <div style="padding: 15px; text-align: center; color: #777;">טוען...</div>
            </div>
            <a href="site-updates.html" class="notif-footer-link">Site Updates</a>
        </div>
    </div>
    
    <!-- תפריט משתמש – אווטאר + שם + דרופדאון פעולות -->
    <div class="dropdown user-menu">
        <div id="user-profile-container" class="profile-trigger">
            <!-- תמונת ברירת מחדל – מוחלפת ע"י auth.js אם המשתמש מחובר -->
            <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" id="user-avatar" class="nav-avatar">
            <button id="navAuthBtn" class="dropbtn">אורח/ת ▼</button>
        </div>
        <div class="dropdown-content" id="user-dropdown-content">
            <a href="profile.html" id="profileLink">פרופיל אישי</a>
            <a href="#" id="authActionBtn">התחבר</a> 
        </div>
    </div>

    <!-- כפתורי התחברות/הרשמה – מוצגים בתצוגת מובייל -->
    <div class="nav-auth-buttons" id="navAuthButtons" style="display: none;">
        <a href="auth.html" class="btn-nav-login">Log In</a>
        <a href="auth.html?mode=signup" class="btn-nav-join">Join Free</a>
    </div>
`;

/* ================================================================
   חלק 2: הזרקת ה-HTML לתוך אלמנט ה-nav
   ================================================================ */
const navBox = document.getElementById("main-nav");
if (navBox) {
  navBox.innerHTML = navbarHTML;
}

/* ================================================================
   חלק 3: דרופדאון קורסים בניווט
   ================================================================
   הערה: הרשימה הסטטית שלמעלה היא ברירת מחדל.
   הקובץ courses-data.js מעדכן דינמית את 'nav-dropdown-list'
   עם הקורסים האמיתיים מ-Firebase, ולכן הקוד הבא מושבת (commented out).
*/
const coursesDropdown = document.getElementById("nav-dropdown-list");
if (coursesDropdown) {
  /* הדרופדאון כבר מאוכלס דינמית ע"י courses-data.js – אין צורך בדריסה סטטית */
}

/* ================================================================
   חלק 4: לוגיקת פתיחה/סגירה של פעמון ההתראות
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  /* השהייה קצרה כדי לוודא ש-auth.js סיים להזריק אלמנטים */
  setTimeout(() => {
    const notifBtn = document.getElementById("navNotifBtn");
    const notifDropdown = document.getElementById(
      "notifications-dropdown-content",
    );

    if (notifBtn && notifDropdown) {
      /* לחיצה על פעמון – מחליפה בין פתוח/סגור */
      notifBtn.addEventListener("click", (e) => {
        e.preventDefault();
        notifDropdown.style.visibility =
          notifDropdown.style.visibility === "visible" ? "hidden" : "visible";
        notifDropdown.style.opacity =
          notifDropdown.style.visibility === "visible" ? "1" : "0";
        notifDropdown.style.pointerEvents =
          notifDropdown.style.visibility === "visible" ? "auto" : "none";
        notifDropdown.style.transform =
          notifDropdown.style.visibility === "visible"
            ? "translateY(0)"
            : "translateY(10px)";

        /* סגירת תפריט המשתמש אם פתוח (כדי שלא יהיו שניים פתוחים) */
        const userDropdownContent = document.getElementById(
          "user-dropdown-content",
        );
        if (
          userDropdownContent &&
          userDropdownContent.style.visibility === "visible"
        ) {
          userDropdownContent.style.visibility = "hidden";
          userDropdownContent.style.opacity = "0";
          userDropdownContent.style.pointerEvents = "none";
          userDropdownContent.style.transform = "translateY(10px)";
        }
      });

      /* סגירה אוטומטית – לחיצה בכל מקום אחר במסך סוגרת את ההתראות */
      document.addEventListener("click", (e) => {
        if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
          notifDropdown.style.visibility = "hidden";
          notifDropdown.style.opacity = "0";
          notifDropdown.style.pointerEvents = "none";
          notifDropdown.style.transform = "translateY(10px)";
        }
      });
    }
  }, 500);
});
