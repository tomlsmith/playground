import { useI18n, type Locale } from "../i18n";

const LOCALES: readonly Locale[] = ["en", "zh-Hans"];

export function LanguageSwitch() {
  const { locale, messages, selectLocale } = useI18n();

  return (
    <div
      className="language-switch"
      role="group"
      aria-label={messages.language.groupLabel}
    >
      {LOCALES.map((option) => {
        const isEnglish = option === "en";
        return (
          <button
            type="button"
            aria-label={
              isEnglish
                ? messages.language.switchToEnglish
                : messages.language.switchToChinese
            }
            aria-pressed={locale === option}
            onClick={() => selectLocale(option)}
            key={option}
          >
            <span lang={option}>
              {isEnglish
                ? messages.language.english
                : messages.language.chinese}
            </span>
          </button>
        );
      })}
    </div>
  );
}
