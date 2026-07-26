import { Link } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";

const POLICY_VERSION_LABEL = "26.7.2026";

function Section({ title, children }) {
  return (
    <div className="anim-rise card-glass p-5 space-y-2">
      <h3 className="text-text-hi font-bold">{title}</h3>
      <div className="text-text-mid text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen p-4" dir="rtl">
      <div className="w-full max-w-md mx-auto space-y-4 pb-10">
        <div className="text-center mb-4 anim-rise">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <span className="w-11 h-11 rounded-2xl bg-volt flex items-center justify-center shadow-[0_0_28px_rgba(163,230,53,0.4)]">
              <Zap className="w-6 h-6 text-ink" fill="currentColor" strokeWidth={0} />
            </span>
            <h1 className="text-3xl font-extrabold text-text-hi tracking-tight" dir="ltr">
              Fit<span className="text-volt">AI</span>
            </h1>
          </div>
          <h2 className="text-xl font-bold text-text-hi">מדיניות פרטיות</h2>
          <p className="text-text-mid text-xs mt-1">עודכן לאחרונה: {POLICY_VERSION_LABEL}</p>
        </div>

        <Section title="מי מפעיל את האפליקציה">
          <p>
            FitAI היא אפליקציית כושר ותזונה המופעלת על ידי מפתח עצמאי. לשאלות בנוגע לפרטיות ניתן
            ליצור קשר בכתובת המייל בתחתית עמוד זה.
          </p>
        </Section>

        <Section title="אילו נתונים נאספים ולמה">
          <ul className="list-disc list-inside space-y-1.5">
            <li><b className="text-text-hi">כתובת מייל וסיסמה (מוצפנת)</b> — לצורך יצירת חשבון, התחברות, ואימות זהות.</li>
            <li><b className="text-text-hi">משקל ומדדי גוף</b> — כדי לחשב מדדים אישיים (BMI, BMR, TDEE) ולהציג מעקב התקדמות לאורך זמן.</li>
            <li><b className="text-text-hi">יומן אכילה</b> — כדי לעקוב אחר צריכה קלורית ותזונתית ולבנות תוכניות תזונה מותאמות אישית.</li>
            <li><b className="text-text-hi">תמונות התקדמות</b> — אם תבחר/י להעלות כאלה, לצורך מעקב חזותי אישי בלבד.</li>
            <li><b className="text-text-hi">מדדים מחושבים</b> (BMI, BMR, TDEE וכו') — מחושבים מהנתונים לעיל, לצורך הצגת תובנות מותאמות אישית.</li>
            <li><b className="text-text-hi">נתוני שימוש טכניים</b> (כגון כתובת IP, סוג מכשיר) — לצורך אבטחת החשבון, מניעת שימוש לרעה, ותפעול תקין של השירות.</li>
          </ul>
        </Section>

        <Section title="מכירה ופרסום">
          <p>
            הנתונים שלך <b className="text-text-hi">אינם נמכרים</b> לצד שלישי, ואינם משמשים לפרסום
            ממוקד. הנתונים משמשים אך ורק לתפעול השירות עצמו.
          </p>
        </Section>

        <Section title="עם מי משתפים נתונים (ספקי שירות)">
          <p>לצורך תפעול השירות אנו נעזרים בספקים חיצוניים הבאים, שכל אחד מהם מקבל רק את המידע הדרוש לתפקידו:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li><b className="text-text-hi">Railway</b> — אחסון האפליקציה ומסד הנתונים.</li>
            <li><b className="text-text-hi">Resend</b> — שליחת מיילים תפעוליים (אימות חשבון, איפוס סיסמה).</li>
            <li><b className="text-text-hi">Anthropic</b> — הפעלת סוכני AI ליצירת תוכניות תזונה ואימונים מותאמות אישית.</li>
          </ul>
        </Section>

        <Section title="משך שמירת המידע">
          <p>
            המידע נשמר כל עוד החשבון פעיל. במחיקת חשבון, המידע האישי (כולל תמונות, יומני אכילה
            ומדדים) נמחק בתוך זמן סביר. עותקי גיבוי עשויים להישמר לפרק זמן קצר נוסף כחלק מתהליך
            הגיבוי השוטף, ומתחלפים אוטומטית.
          </p>
        </Section>

        <Section title="הזכויות שלך">
          <p>בכל עת ניתן:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>לצפות במידע האישי השמור עליך.</li>
            <li>לתקן מידע שגוי או לא מעודכן.</li>
            <li>למחוק את החשבון ואת המידע הנלווה אליו.</li>
          </ul>
          <p>
            ניתן לבצע פעולות אלו דרך הגדרות החשבון באפליקציה, או בפנייה ישירה לכתובת המייל בתחתית
            עמוד זה.
          </p>
        </Section>

        <Section title="אבטחת מידע">
          <p>
            סיסמאות נשמרות מוצפנות (hashed) ולעולם לא בטקסט גלוי. התקשורת בין המכשיר שלך לשרת
            מוצפנת (HTTPS). הגישה למידע מוגבלת ומבוקרת.
          </p>
        </Section>

        <Section title="הגבלת גיל">
          <p>השירות אינו מיועד לשימוש על ידי ילדים מתחת לגיל 16.</p>
        </Section>

        <Section title="יצירת קשר">
          <p dir="ltr" className="text-left">guyvaks@gmail.com</p>
          <p>גרסת מדיניות: {POLICY_VERSION_LABEL}</p>
        </Section>

        <Link
          to="/"
          className="flex items-center justify-center gap-1.5 text-volt hover:underline font-medium text-sm py-3"
        >
          <ArrowRight className="w-4 h-4" /> חזרה לאפליקציה
        </Link>
      </div>
    </div>
  );
}
