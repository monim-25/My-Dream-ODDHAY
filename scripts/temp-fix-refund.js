// Refund Payment
router.post('/payments/:id/refund', superAdminProtect, async (req, res) => {
    try {
        await connectDB();
        
        console.log('Refund request received for:', req.params.id);
        console.log('Request body:', JSON.stringify(req.body));
        
        const payment = await Payment.findById(req.params.id).populate('course');
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
        if (payment.status !== 'success') return res.status(400).json({ success: false, error: 'Can only refund successful payments' });

        // Get values from request body
        var refundType = req.body.type || 'full';
        var refundAmountStr = req.body.amount;
        var refundReason = req.body.reason || '';
        
        console.log('Parsed values:', { refundType, refundAmountStr, refundReason });
        
        // Determine refund amount
        var refundAmount;
        if (refundType === 'full') {
            refundAmount = payment.amount;
            console.log('Full refund amount:', refundAmount);
        } else {
            // Partial refund - parse and validate amount
            var parsedAmount = parseFloat(refundAmountStr);
            console.log('Parsed partial amount:', parsedAmount);
            
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ success: false, error: 'Invalid refund amount: must be a number greater than 0' });
            }
            if (parsedAmount >= payment.amount) {
                return res.status(400).json({ success: false, error: 'Partial refund amount must be less than payment amount (' + payment.amount + ')' });
            }
            
            refundAmount = parsedAmount;
            console.log('Final partial refund amount:', refundAmount);
        }

        // Update payment status based on refund type
        if (refundType === 'full') {
            payment.status = 'refunded';
            // Remove course access for full refund
            var user = await User.findById(payment.user);
            if (user && payment.course) {
                user.enrolledCourses = user.enrolledCourses.filter(function(e) { 
                    return e.course.toString() !== payment.course._id.toString(); 
                });
                await user.save();
                console.log('Removed course access from user');
            }
        } else {
            payment.status = 'partial_refund';
            console.log('Set status to partial_refund - keeping course access');
        }

        // Save refund details
        payment.refundAmount = refundAmount;
        payment.refundReason = refundReason;
        payment.refundDate = new Date();
        payment.refundBy = req.session.userId;
        payment.adminNote = (payment.adminNote ? payment.adminNote + ' | ' : '') + 'Refunded ৳' + refundAmount + ' (' + refundType + ') by ' + req.session.user.name + ' on ' + new Date().toLocaleString();
        
        await payment.save();
        console.log('Payment saved with status:', payment.status, 'refundAmount:', payment.refundAmount);

        res.json({ success: true, refundAmount: refundAmount, status: payment.status });
    } catch (err) {
        console.error('Refund Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});
