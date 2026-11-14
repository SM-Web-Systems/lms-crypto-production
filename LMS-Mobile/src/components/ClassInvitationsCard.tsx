import { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { classInvitationService, type ClassInvitation } from '@/services/classInvitationService';
import { getErrorMessage } from '@/utils/apiError';

/** Shows classes that invited the learner. Renders nothing when there is nothing to answer. */
export function ClassInvitationsCard() {
  const [items, setItems] = useState<ClassInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await classInvitationService.mine()); } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const answer = async (id: string, accept: boolean) => {
    setBusyId(id); setError(null);
    try { await classInvitationService.respond(id, accept); await load(); }
    catch (e) { setError(getErrorMessage(e, 'Could not answer the invitation.')); }
    finally { setBusyId(null); }
  };

  if (items.length === 0 && !error) return null;
  return (
    <Card>
      <Text className="mb-2 text-base font-bold text-neutral-900">Class invitations</Text>
      {error ? <Text accessibilityRole="alert" className="mb-2 text-sm text-red-700">{error}</Text> : null}
      {items.map((i) => (
        <View key={i.id} className="mb-3 gap-2">
          <Text className="text-sm text-neutral-800">
            {i.invitedBy} invited you to the class {i.className}. Joining lets them see your progress.
          </Text>
          <View className="flex-row gap-2">
            <Button label="Join" size="sm" disabled={busyId === i.id} onPress={() => answer(i.id, true)} />
            <Button label="Decline" size="sm" variant="outline" disabled={busyId === i.id} onPress={() => answer(i.id, false)} />
          </View>
        </View>
      ))}
    </Card>
  );
}
