'use client';

import { useState, useEffect } from 'react';
import { FieldDefinition } from '@/types/job';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Sparkles, Wand2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface StepFieldSelectorProps {
  onNext: (fields: FieldDefinition[]) => void;
  onBack: () => void;
  initialFields?: FieldDefinition[];
}

const EMPTY_FIELDS: FieldDefinition[] = [];

const normalizeField = (field: FieldDefinition): FieldDefinition => ({
  ...field,
  is_custom: field.is_custom ?? false,
});

export function StepFieldSelector({
  onNext,
  onBack,
  initialFields = EMPTY_FIELDS,
}: StepFieldSelectorProps) {
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>([]);
  const [selectedFields, setSelectedFields] = useState<FieldDefinition[]>(initialFields);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customHint, setCustomHint] = useState('');

  useEffect(() => {
    const fetchFields = async () => {
      try {
        const res = await apiClient.get('/fields/');
        if (res.data?.data?.fields) {
          const fields = res.data.data.fields.map(normalizeField);
          setAvailableFields(fields);

          if (initialFields.length === 0) {
            const defaults = ['name', 'email', 'phone'];
            const defaultSelection = fields.filter((f: FieldDefinition) =>
              defaults.includes(f.key)
            );
            setSelectedFields(defaultSelection);
          }
        }
      } catch (err) {
        console.error('Failed to load fields', err);
      }
    };
    fetchFields();
  }, [initialFields]);

  const toggleField = (field: FieldDefinition) => {
    const normalizedField = normalizeField(field);
    setSelectedFields((prev) => {
      const exists = prev.find((f) => f.key === normalizedField.key);
      if (exists) {
        return prev.filter((f) => f.key !== normalizedField.key);
      } else {
        return [...prev, normalizedField];
      }
    });
  };

  const addCustomField = () => {
    if (!customLabel.trim()) return;

    const slug =
      customLabel
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'field';
    const baseKey = `custom_${slug}`;

    const newField: FieldDefinition = {
      key: selectedFields.some((field) => field.key === baseKey)
        ? `${baseKey}_${Date.now()}`
        : baseKey,
      label: customLabel.trim(),
      type: 'string',
      is_custom: true,
      hint: customHint.trim(),
    };

    setSelectedFields((prev) => [...prev, newField]);
    setCustomLabel('');
    setCustomHint('');
    setShowCustomForm(false);
  };

  const removeSelected = (key: string) => {
    setSelectedFields((prev) => prev.filter((f) => f.key !== key));
  };

  const applyTemplate = (keys: string[]) => {
    const templateFields = availableFields.filter((f) => keys.includes(f.key));
    setSelectedFields(templateFields);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto panel rounded-xl p-6 sm:p-10 mt-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-heading font-bold mb-3 tracking-tight text-foreground">
          What do you want to extract?
        </h2>
        <p className="text-muted-foreground text-sm max-w-lg leading-relaxed">
          Select standard fields, use a predefined template, or create custom ones tailored for
          your specific hiring needs.
        </p>
      </div>

      {/* Templates */}
      <div className="flex flex-wrap gap-3 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyTemplate(['name', 'email', 'phone', 'education'])}
          className="rounded-full bg-surface border-border hover:bg-surface-elevated hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Sparkles className="mr-2 h-3.5 w-3.5 text-primary" /> Basic Candidate Info
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyTemplate(['name', 'email', 'skills', 'experience_years'])}
          className="rounded-full bg-surface border-border hover:bg-surface-elevated hover:text-foreground transition-colors"
        >
          <Wand2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Technical Hiring
        </Button>
      </div>

      {/* Standard fields grid */}
      <div className="space-y-4">
        <h3 className="font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
          Standard Fields
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableFields
            .filter((f) => !f.is_custom)
            .map((field) => {
              const isSelected = selectedFields.some((f) => f.key === field.key);
              return (
                <motion.label
                  key={field.key}
                  htmlFor={field.key}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'flex items-center space-x-3 p-3.5 border rounded-lg cursor-pointer transition-colors duration-200',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/40 hover:bg-surface'
                  )}
                >
                  <Checkbox
                    id={field.key}
                    checked={isSelected}
                    onCheckedChange={() => toggleField(field)}
                    className={
                      isSelected
                        ? 'border-primary data-[state=checked]:bg-primary'
                        : 'border-muted-foreground/50'
                    }
                  />
                  <span className="flex-1 cursor-pointer text-sm font-medium text-foreground/90">
                    {field.label}
                  </span>
                </motion.label>
              );
            })}
        </div>
      </div>

      {/* Selected fields + custom field */}
      <div className="space-y-5 border-t border-border pt-8">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[11px] uppercase tracking-widest text-muted-foreground">
            Selected Fields ({selectedFields.length})
          </h3>
          {!showCustomForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomForm(true)}
              className="rounded-full bg-surface border-border hover:bg-surface-elevated hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Custom Field
            </Button>
          )}
        </div>

        {/* Custom field form — section separator, not a nested card */}
        <AnimatePresence>
          {showCustomForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border pt-5 space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="customLabel"
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      Field Name
                    </Label>
                    <Input
                      id="customLabel"
                      placeholder="e.g. Notice Period"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      className="bg-background border-border focus-visible:ring-primary h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="customHint"
                      className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                    >
                      AI Hint (Optional)
                    </Label>
                    <Input
                      id="customHint"
                      placeholder="e.g. Look for how soon they can join"
                      value={customHint}
                      onChange={(e) => setCustomHint(e.target.value)}
                      className="bg-background border-border focus-visible:ring-primary h-11 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => setShowCustomForm(false)}
                    className="hover:bg-surface text-muted-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={addCustomField}
                    disabled={!customLabel.trim()}
                    className="bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25"
                  >
                    Add Custom Field
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected field pills */}
        <div className="flex flex-wrap gap-2.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence>
            {selectedFields.map((field) => (
              <motion.div
                key={field.key}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                layout
                className="flex items-center justify-between py-2 pl-4 pr-2 bg-surface border border-border rounded-full hover:border-primary/40 hover:bg-surface-elevated transition-colors group"
              >
                <div className="flex items-center space-x-2 mr-3">
                  <span className="text-sm font-medium text-foreground/90">{field.label}</span>
                  {field.is_custom && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 uppercase tracking-wider"
                    >
                      Custom
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/20 transition-colors"
                  onClick={() => removeSelected(field.key)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {selectedFields.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground/60 italic p-6 text-center border border-dashed border-border rounded-lg w-full"
            >
              No fields selected.
            </motion.p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between pt-6 border-t border-border">
        <Button
          variant="outline"
          size="lg"
          onClick={onBack}
          className="bg-surface border-border hover:bg-surface-elevated hover:text-foreground transition-colors rounded-lg"
        >
          Back
        </Button>
        <Button
          size="lg"
          onClick={() => onNext(selectedFields)}
          disabled={selectedFields.length === 0}
          className="bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 px-8 text-white transition-all hover:-translate-y-0.5 group rounded-lg"
        >
          Confirm & Continue{' '}
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}