import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  return (
    <div className="inline-flex overflow-hidden rounded-md border bg-background">
      <Button
        size="sm"
        variant={isZh ? "default" : "ghost"}
        className="h-8 rounded-none px-2.5 text-xs"
        onClick={() => void i18n.changeLanguage("zh")}
      >
        中
      </Button>
      <Button
        size="sm"
        variant={!isZh ? "default" : "ghost"}
        className="h-8 rounded-none px-2.5 text-xs"
        onClick={() => void i18n.changeLanguage("en")}
      >
        EN
      </Button>
    </div>
  );
}
