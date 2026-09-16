import { useCallback, useState } from 'react';

/**
 * Minimal controlled-form state with server-error mapping.
 * API validation details whose path matches a field land on that field;
 * anything else is surfaced as a form-level error.
 */
export function useFormState(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const set = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: typeof value === 'function' ? value(prev[name]) : value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }, []);

  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => set(name, e.target.value),
  });

  const handleError = (err) => {
    const details = err?.details ?? [];
    if (!details.length) {
      setFormError(err?.message ?? 'Something went wrong');
      return;
    }
    const fieldErrors = {};
    const unmatched = [];
    for (const d of details) {
      const field = d.path.split('.')[0];
      if (field in values && !fieldErrors[field]) fieldErrors[field] = d.message;
      else unmatched.push(d.message);
    }
    setErrors(fieldErrors);
    setFormError(unmatched.length ? unmatched.join(' · ') : null);
  };

  /** Returns true when there are no client-side errors. */
  const validate = (rules) => {
    const next = {};
    for (const [field, rule] of Object.entries(rules)) {
      const message = rule(values[field], values);
      if (message) next[field] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return { values, set, bind, errors, setErrors, formError, setFormError, handleError, validate };
}
