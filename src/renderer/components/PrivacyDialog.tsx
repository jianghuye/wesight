import React, { useState } from 'react';

import { i18nService, type LanguageType } from '@/services/i18n';

const PRIVACY_URL = 'https://c.youdao.com/dict/hardware/wesight/wesight_service.html';

interface PrivacyDialogProps {
  onAccept: () => void;
  onReject: () => void;
}

const PrivacyDialog: React.FC<PrivacyDialogProps> = ({ onAccept, onReject }) => {
  const [language, setLanguage] = useState<LanguageType>(i18nService.getLanguage());

  const handleLinkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    await window.electron.shell.openExternal(PRIVACY_URL);
  };

  const handleLanguageChange = (nextLanguage: LanguageType) => {
    setLanguage(nextLanguage);
    i18nService.setLanguage(nextLanguage);
  };

  const desc = i18nService.t('privacyDialogDesc');
  const linkText = i18nService.t('privacyDialogLinkText');
  const parts = desc.split('{link}');
  const languageOptions: Array<{ value: LanguageType; label: string; helper: string }> = [
    { value: 'zh', label: '中文', helper: '简体中文' },
    { value: 'en', label: 'English', helper: 'International' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
      <div className="modal-content w-full max-w-md mx-4 bg-surface rounded-2xl shadow-modal overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-foreground text-center">
            {i18nService.t('privacyDialogTitle')}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <div className="rounded-xl border border-border bg-surface-raised/60 p-3">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-secondary">
              {i18nService.t('chooseLanguageTitle')}
            </div>
            <p className="mt-1 text-xs text-secondary leading-relaxed">
              {i18nService.t('chooseLanguageHint')}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {languageOptions.map((option) => {
                const isSelected = language === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleLanguageChange(option.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-0.5 text-[11px] text-secondary">{option.helper}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-secondary text-center leading-relaxed">
            {parts[0]}
            <a
              href={PRIVACY_URL}
              onClick={handleLinkClick}
              className="text-primary hover:text-primary-hover underline"
            >
              {linkText}
            </a>
            {parts[1]}
          </p>
        </div>

        {/* Buttons */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-secondary bg-surface-raised hover:opacity-80 transition-opacity"
          >
            {i18nService.t('privacyDialogReject')}
          </button>
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
          >
            {i18nService.t('privacyDialogAccept')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyDialog;
