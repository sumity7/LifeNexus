import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { Button, Field, FormError, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';

function passwordIssue(v) {
  if (!v) return 'Password is required';
  if (v.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number';
  return null;
}

export default function Register() {
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const form = useFormState({ name: '', email: '', password: '' });
  const { values, errors } = form;

  const onSubmit = async (e) => {
    e.preventDefault();
    const valid = form.validate({
      name: (v) => (!v.trim() ? 'Tell us your name' : null),
      email: (v) => (!v.trim() ? 'Email is required' : !/^\S+@\S+\.\S+$/.test(v) ? 'Enter a valid email' : null),
      password: passwordIssue,
    });
    if (!valid) return;
    setSubmitting(true);
    try {
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
    } catch (err) {
      if (err.status === 409) form.setErrors({ email: err.message });
      else form.handleError(err);
      setSubmitting(false);
    }
  };

  const strength = [values.password.length >= 8, /[A-Za-z]/.test(values.password) && /\d/.test(values.password), values.password.length >= 12 || /[^A-Za-z0-9]/.test(values.password)].filter(Boolean).length;

  return (
    <AuthLayout title="Create your LifeNexus" subtitle="Set up your personal operating system in under a minute.">
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError error={form.formError} />
        <Field label="Name" error={errors.name}>
          <Input autoComplete="name" autoFocus {...form.bind('name')} placeholder="Alex Morgan" maxLength={80} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" {...form.bind('email')} placeholder="you@example.com" />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...form.bind('password')} placeholder="••••••••" maxLength={128} />
        </Field>
        {values.password && (
          <div className="password-strength" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < strength ? `is-on is-${strength}` : ''} />
            ))}
            <span className="text-xs muted">{['Too weak', 'Weak', 'Good', 'Strong'][strength]}</span>
          </div>
        )}
        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          Create account
        </Button>
      </form>
      <p className="auth__switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
